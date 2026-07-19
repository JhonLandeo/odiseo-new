import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantService } from '../../database/tenant.service';
import { WebhookStatusRequestDto } from '../dto/webhook-status-request.dto';
import {
  MaterialRequestCourse,
  CourseMaterialStatus,
} from '../entities/material-request-course.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestStatus } from '../entities/material-status.enum';
import { Material } from '../entities/material.entity';
import { MaterialQuestionUsage } from '../entities/material-question-usage.entity';
import { ClsService } from 'nestjs-cls';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MATERIALS_JOB_OPTIONS } from '../constants/materials-queue.constants';

/**
 * One question placed in the generated PDF of the course this callback is
 * about. `materialRequestId` and `courseId` are NOT part of this shape on
 * purpose: both are derived from the course row loaded inside the transaction,
 * so the ledger can never be written against a different course than the one
 * whose status is being transitioned.
 */
export interface QuestionUsageRecord {
  cycleId: string;
  questionId: string;
  topicId: string;
  subtopicId: string;
  positionInPdf: number;
  wasReplacement: boolean;
}

/**
 * Billing artifact metadata for the STUDENT PDF of one course, captured by
 * the processor right after it renders the Buffer and before upload — the
 * cheapest correct source of truth (no S3 re-read, no separate scan). Threads
 * alongside `questionUsages` into the same atomic `runInTenant` transaction
 * that commits the course's terminal status (spec 008 FR-007).
 */
export interface PdfArtifactMeta {
  pageCount?: number;
  fileSizeBytes?: number;
}

@Injectable()
export class HandleMaterialWebhookUseCase {
  private readonly logger = new Logger(HandleMaterialWebhookUseCase.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly cls: ClsService,
    @InjectQueue('materials-queue') private readonly materialsQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Maps a Worker-reported status string onto a course status.
   *
   * An unknown value is a contract violation, not a course outcome. Previously
   * it fell through to FAILED, which silently turned a producer bug into a
   * failed material. We now reject it (400). The retry implication: a 4xx tells
   * BullMQ the payload is bad, so it may re-deliver — which is the correct
   * behaviour for a genuinely malformed status (it will keep failing loudly and
   * surface in dead-letter inspection) and is preferable to silently corrupting
   * a course. Transient infrastructure errors take a different path (they throw
   * 5xx elsewhere), so this does not cause an infinite retry of a healthy job.
   */
  private mapStatus(status: string): CourseMaterialStatus {
    switch (status) {
      case 'completed':
        return CourseMaterialStatus.COMPLETED;
      case 'completed_with_warnings':
        return CourseMaterialStatus.COMPLETED_WITH_WARNINGS;
      case 'empty_bank':
        return CourseMaterialStatus.EMPTY_BANK;
      case 'failed':
        return CourseMaterialStatus.FAILED;
      case 'processing':
        return CourseMaterialStatus.PROCESSING;
      default:
        throw new BadRequestException(`Unknown webhook status: ${status}`);
    }
  }

  async execute(
    statusData: WebhookStatusRequestDto,
    questionUsages?: QuestionUsageRecord[],
    artifactMeta?: PdfArtifactMeta,
  ): Promise<void> {
    if (!statusData.job_id || !statusData.status) {
      throw new BadRequestException('job_id and status are required');
    }
    this.logger.log(
      `Received internal webhook update for job ${statusData.job_id}: ${statusData.status}`,
    );

    // Reject an out-of-contract status before opening a transaction.
    const incomingStatus = this.mapStatus(statusData.status);

    // Set inside the transaction, ONLY on the success-terminal branch that
    // used to emit directly; read and emitted after the transaction commits
    // (see the emit call at the end of this method for why).
    let materialGeneratedEvent:
      { cycleId: string; courseId: string; weekNumber: number } | undefined;

    await this.tenantService.runInTenant(async (manager) => {
      // Find course request by ID
      const courseReq = await manager.findOne(MaterialRequestCourse, {
        where: { id: statusData.job_id },
      });
      if (!courseReq) {
        // A callback for a course that no longer exists (e.g. its request was
        // deleted) is a benign no-op, never a 500.
        this.logger.warn(
          `No MaterialRequestCourse found for job_id: ${statusData.job_id}`,
        );
        return;
      }

      // --- Idempotency / terminal-state guard (ASYMMETRIC) -----------------
      //
      // The Worker delivers at-least-once and BullMQ retries (attempts: 3), so
      // duplicate and late callbacks are NORMAL traffic, not an attack.
      //
      // Success is AUTHORITATIVE. Once a course reached COMPLETED or
      // COMPLETED_WITH_WARNINGS its PDFs exist in S3; nothing that arrives
      // afterwards may undo that. Ignoring a late `failed` here is exactly what
      // stops a finished material from being rolled back to FAILED, and makes a
      // duplicate `completed` an idempotent no-op.
      if (
        courseReq.status === CourseMaterialStatus.COMPLETED ||
        courseReq.status === CourseMaterialStatus.COMPLETED_WITH_WARNINGS
      ) {
        this.logger.log(
          `Ignoring '${statusData.status}' for course ${courseReq.id}: ` +
            `already in success-terminal state ${courseReq.status}`,
        );
        return;
      }

      // FAILED (and the intermediate PROCESSING / EMPTY_BANK) are PROVISIONAL,
      // not final: a later retry that finally succeeds MUST be allowed to
      // overwrite them, so we do NOT ignore a `completed` arriving after a
      // `failed`. Only a redelivery of the exact same non-success status is a
      // no-op — this keeps a repeated `failed` from re-running the parent
      // roll-up (and, defensively, from re-dispatching the merge job).
      if (courseReq.status === incomingStatus) {
        this.logger.log(
          `Ignoring duplicate '${statusData.status}' for course ` +
            `${courseReq.id}: status unchanged (${courseReq.status})`,
        );
        return;
      }

      const isSuccessTerminal =
        incomingStatus === CourseMaterialStatus.COMPLETED ||
        incomingStatus === CourseMaterialStatus.COMPLETED_WITH_WARNINGS;

      // Update course request
      await manager.update(MaterialRequestCourse, courseReq.id, {
        status: incomingStatus,
        downloadUrl: statusData.download_url || undefined,
        keyDownloadUrl: statusData.key_download_url || undefined,
        solutionDownloadUrl: statusData.solution_download_url || undefined,
        warnings: (statusData.error_message
          ? { error: statusData.error_message }
          : null) as any,
        // Billing artifact metadata (spec 008 FR-007): simple column writes on
        // the SAME update as the terminal status, in the SAME transaction —
        // no new savepoint needed. `undefined` is omitted from the SET clause
        // by TypeORM, so a failed/empty_bank callback (no artifactMeta) or a
        // page-count extraction failure leaves these columns untouched/NULL.
        pageCount: artifactMeta?.pageCount ?? undefined,
        fileSizeBytes: artifactMeta?.fileSizeBytes ?? undefined,
        // The monthly billing collector scopes `pdf_pages_generated` by THIS
        // column, not `createdAt` (request-submission time) — a course
        // created near a month boundary whose generation finishes in the
        // following month must land in the completion month's bucket.
        completedAt: isSuccessTerminal ? new Date() : undefined,
      });

      this.logger.log(
        `MaterialRequestCourse ${courseReq.id} updated to ${incomingStatus}`,
      );

      // --- Anti-repetition ledger, atomic with the terminal status ---------
      //
      // The usage rows and the success status must commit TOGETHER. They used
      // to be written by the processor in a separate transaction after this
      // one committed, so a crash in between left a COMPLETED course whose
      // questions were never recorded — silently weakening anti-repetition
      // for every later generation in the cycle. Writing them here, on the
      // same transaction manager, makes "COMPLETED with no usage rows"
      // unrepresentable.
      //
      // Delete-then-insert keeps the write idempotent for a regenerated
      // course (a retry that finally succeeds replaces the prior attempt's
      // rows). The insert uses ON CONFLICT DO NOTHING (orIgnore) against the
      // unique index uq_material_question_usage_request_course_question
      // (tenant migration 0009): a raised 23505 inside runInTenant would
      // poison the whole transaction, so a duplicate question in the payload
      // must degrade to a silent no-op instead.
      //
      // The ledger write runs under a savepoint: an unexpected failure here
      // (FK/NOT NULL violation, deadlock, statement timeout — anything the
      // orIgnore does not cover) must not roll back the COMPLETED status of a
      // PDF that already exists in S3. Sinking the status would make the
      // processor's catch report the course FAILED with no download URL, and
      // a deterministic payload defect would pin it there through every
      // BullMQ retry. Rolling back to the savepoint keeps the status commit
      // and degrades to a loudly-logged missing ledger instead.
      if (
        questionUsages &&
        questionUsages.length > 0 &&
        (incomingStatus === CourseMaterialStatus.COMPLETED ||
          incomingStatus === CourseMaterialStatus.COMPLETED_WITH_WARNINGS)
      ) {
        await manager.query('SAVEPOINT usage_ledger');
        try {
          await manager.delete(MaterialQuestionUsage, {
            materialRequestId: courseReq.materialRequestId,
            courseId: courseReq.courseId,
          });
          await manager
            .createQueryBuilder()
            .insert()
            .into(MaterialQuestionUsage)
            .values(
              questionUsages.map((usage) => ({
                materialRequestId: courseReq.materialRequestId,
                courseId: courseReq.courseId,
                cycleId: usage.cycleId,
                questionId: usage.questionId,
                topicId: usage.topicId,
                subtopicId: usage.subtopicId,
                positionInPdf: usage.positionInPdf,
                wasReplacement: usage.wasReplacement,
              })),
            )
            .orIgnore()
            .execute();
          await manager.query('RELEASE SAVEPOINT usage_ledger');
        } catch (ledgerError) {
          await manager.query('ROLLBACK TO SAVEPOINT usage_ledger');
          this.logger.error(
            `Question-usage ledger write failed for request ${courseReq.materialRequestId} course ${courseReq.courseId}; ` +
              `committing status ${incomingStatus} WITHOUT usage rows — anti-repetition is weakened for this course`,
            ledgerError instanceof Error
              ? ledgerError.stack
              : String(ledgerError),
          );
        }
      }

      // --- Serialize the parent roll-up with a pessimistic write lock ------
      //
      // Two final callbacks for two different courses of the same request run
      // in separate transactions and can both otherwise observe "all finished"
      // and both dispatch the merge job. Taking a FOR UPDATE lock on the parent
      // row forces them to serialize: the second callback blocks here until the
      // first commits, then (under READ COMMITTED, TypeORM/Postgres default)
      // reads the first one's committed sibling update and sees the transition
      // into "all finished" exactly once.
      const requestParent = await manager.findOne(MaterialRequest, {
        where: { id: courseReq.materialRequestId },
        lock: { mode: 'pessimistic_write' },
      });

      // Snapshot the parent status BEFORE the roll-up so we can tell whether
      // THIS callback is the one transitioning the request into a final
      // success state (see the merge-once guard below).
      const previousParentStatus = requestParent?.status;

      if (
        requestParent &&
        (incomingStatus === CourseMaterialStatus.COMPLETED ||
          incomingStatus === CourseMaterialStatus.COMPLETED_WITH_WARNINGS)
      ) {
        // Captured here, EMITTED after the transaction resolves (see below).
        // The exact condition for whether the event fires is unchanged; only
        // the moment the actual .emit() call executes moves.
        materialGeneratedEvent = {
          cycleId: requestParent.cycleId,
          courseId: courseReq.courseId,
          weekNumber: requestParent.weekNumber,
        };
      }

      // Check if all courses in the parent MaterialRequest are complete. This
      // read happens while holding the parent lock, so it observes a serialized,
      // fully-committed view of the sibling courses.
      const siblingCourses = await manager.find(MaterialRequestCourse, {
        where: { materialRequestId: courseReq.materialRequestId },
      });

      const allFinished = siblingCourses.every(
        (c) =>
          c.status === CourseMaterialStatus.COMPLETED ||
          c.status === CourseMaterialStatus.COMPLETED_WITH_WARNINGS ||
          c.status === CourseMaterialStatus.EMPTY_BANK ||
          c.status === CourseMaterialStatus.FAILED,
      );

      if (allFinished) {
        const hasFailed = siblingCourses.some(
          (c) => c.status === CourseMaterialStatus.FAILED,
        );
        const hasWarnings = siblingCourses.some(
          (c) =>
            c.status === CourseMaterialStatus.COMPLETED_WITH_WARNINGS ||
            c.status === CourseMaterialStatus.EMPTY_BANK,
        );

        let finalStatus = MaterialRequestStatus.COMPLETED;
        if (hasFailed) {
          finalStatus = MaterialRequestStatus.FAILED;
        } else if (hasWarnings) {
          finalStatus = MaterialRequestStatus.REVIEW_REQUIRED;
        }

        await manager.update(MaterialRequest, courseReq.materialRequestId, {
          status: finalStatus,
        });
        this.logger.log(
          `Parent MaterialRequest ${courseReq.materialRequestId} final status: ${finalStatus}`,
        );

        // Update logical Material parent status
        const request = await manager.findOne(MaterialRequest, {
          where: { id: courseReq.materialRequestId },
        });
        if (request && request.materialId) {
          await manager.update(Material, request.materialId, {
            status: finalStatus,
          });
          this.logger.log(
            `Parent Material ${request.materialId} status updated to ${finalStatus}`,
          );
        }

        // --- Dispatch merge-pdf EXACTLY ONCE ------------------------------
        //
        // Merge-once guard: only dispatch when THIS callback is the one that
        // transitions the parent INTO a final success state. If the parent was
        // ALREADY in a success roll-up state (COMPLETED / REVIEW_REQUIRED),
        // some earlier callback already completed the roll-up and dispatched
        // the merge, so a redelivered final callback must not dispatch a
        // second one. A previous FAILED is deliberately NOT treated as final
        // here, so a genuine retry-success (FAILED -> COMPLETED) still merges.
        const parentAlreadyFinalized =
          previousParentStatus === MaterialRequestStatus.COMPLETED ||
          previousParentStatus === MaterialRequestStatus.REVIEW_REQUIRED;

        if (
          !hasFailed &&
          siblingCourses.length >= 2 &&
          !parentAlreadyFinalized
        ) {
          const request = await manager.findOne(MaterialRequest, {
            where: { id: courseReq.materialRequestId },
          });
          if (request) {
            const tenantId = this.cls.get('companyId');
            if (!tenantId) {
              this.logger.warn(
                'Cannot dispatch merge job: tenant not identified',
              );
              return;
            }
            await this.materialsQueue.add(
              'merge-pdf',
              {
                material_request_id: courseReq.materialRequestId,
                tenant_id: tenantId,
              },
              MATERIALS_JOB_OPTIONS,
            );
            this.logger.log(
              `Merge job dispatched for MaterialRequest ${courseReq.materialRequestId}`,
            );
          }
        }
      }
    });

    // Emitted only AFTER the transaction above has committed, mirroring the
    // "queue jobs after the transaction, not inside it" pattern used
    // elsewhere (generate-material.use-case, approve-material-review.use-
    // case). EventEmitter2's `.emit()` invokes `{ async: true }` listeners
    // without awaiting them, and this method used to call it from inside
    // runInTenant -- MaterialGeneratedListener opens its own runInTenant in
    // reaction, which could silently reuse this webhook's still-open
    // transaction via CLS reentrancy depending on microtask timing. Firing
    // after `runInTenant` resolves removes that ambiguity entirely.
    if (materialGeneratedEvent) {
      this.eventEmitter.emit(
        'material.course.generated',
        materialGeneratedEvent,
      );
    }
  }
}
