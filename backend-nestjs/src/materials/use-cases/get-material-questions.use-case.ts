import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { GcsService } from '../../gcs/gcs.service';
import { FlatQuestionsRepository } from '../../question-bank/flat-questions.repository';
import { TenantService } from '../../database/tenant.service';

@Injectable()
export class GetMaterialQuestionsUseCase {
  private readonly logger = new Logger(GetMaterialQuestionsUseCase.name);

  constructor(
    private readonly flatQuestionsRepo: FlatQuestionsRepository,
    private readonly gcsService: GcsService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Topic ids the caller's tenant has explicitly hidden.
   *
   * Mirrors the Catalogs visibility rule EXACTLY. Catalogs treats a topic as
   * visible when `COALESCE(ttv.is_active, true) = true`
   * (catalog.repository.ts), i.e. it is a hide-list over a default-visible
   * catalogue: a topic is invisible ONLY when an explicit
   * `tenant_topic_visibility` row sets `is_active = false`; an absent row means
   * visible. This set is therefore precisely the rows with `is_active = false`.
   * It lives in the tenant schema on the default connection, while the question
   * bank is a separate connection, so the two cannot be joined in one query —
   * the gate reads this set and filters the bank results in application code.
   */
  private async getHiddenTopicIds(): Promise<string[]> {
    const rows = await this.tenantService.runInTenant((manager) =>
      manager.query(
        `SELECT topic_id FROM tenant_topic_visibility WHERE is_active = false`,
      ),
    );
    return rows.map((r: any) => String(r.topic_id));
  }

  private async mapFlatQuestion(flatQ: any): Promise<any> {
    const signedImages = await Promise.all(
      (flatQ.images || []).map(async (img: any) => ({
        id: img.id,
        code: img.code,
        url: await this.gcsService.getSignedUrl(img.gcs_key),
      })),
    );

    let parsedSolution: any = {};
    if (flatQ.solution) {
      const signedSolutionImages = await Promise.all(
        (flatQ.solution.diagrammed_images || []).map(async (img: any) => ({
          id: img.id,
          url: await this.gcsService.getSignedUrl(img.gcs_key),
        })),
      );
      parsedSolution = {
        diagrammed: flatQ.solution.diagrammed,
        diagrammedImages: signedSolutionImages,
        didiMaths: flatQ.solution.didi_maths,
      };
    }

    return {
      id: String(flatQ.question_id),
      code: flatQ.code,
      levelId: flatQ.level_id,
      levelName: flatQ.level_name,
      type: flatQ.type,
      content: flatQ.html_content,
      options: (flatQ.alternatives || []).map((alt: any, idx: number) => ({
        id: alt.id,
        label: alt.label || String.fromCharCode(65 + idx),
        text: alt.text || alt.description,
        isCorrect: alt.is_correct || alt.isCorrect,
      })),
      configAlternative: flatQ.config_alternative,
      images: signedImages,
      solution: parsedSolution,
      origins: flatQ.origins,
    };
  }

  async getQuestionPreview(questionId: string): Promise<any> {
    const dbQuestionId = Number(questionId);
    if (isNaN(dbQuestionId)) {
      throw new BadRequestException('ID de pregunta inválido');
    }

    // Object-level authorization: the question bank is GLOBAL, so previewing by
    // id must still be gated by what this tenant may see. Resolve the question's
    // topic(s) from the bank and apply the SAME hide-list rule Catalogs uses. If
    // every topic the question belongs to is hidden, the question does not exist
    // FOR THIS TENANT -> 404 (which also avoids disclosing that an out-of-scope
    // question exists). A question with no resolvable topic is left visible,
    // matching the default-visible semantics.
    const [topicIds, hiddenTopicIds] = await Promise.all([
      this.flatQuestionsRepo.findTopicIdsForQuestion(dbQuestionId),
      this.getHiddenTopicIds(),
    ]);
    if (topicIds.length > 0 && hiddenTopicIds.length > 0) {
      const hidden = new Set(hiddenTopicIds);
      const hasVisibleTopic = topicIds.some((id) => !hidden.has(id));
      if (!hasVisibleTopic) {
        this.logger.warn(
          `Denied cross-scope question preview: questionId=${dbQuestionId} topicIds=[${topicIds.join(',')}]`,
        );
        throw new NotFoundException('Pregunta no encontrada');
      }
    }

    let flatQ = await this.flatQuestionsRepo.findById(dbQuestionId);
    if (!flatQ) {
      flatQ = await this.flatQuestionsRepo.findByIdFromNormalized(dbQuestionId);
      if (!flatQ) {
        throw new NotFoundException('Pregunta no encontrada');
      }
    }
    return this.mapFlatQuestion(flatQ);
  }

  async getQuestionAlternatives(
    courseId?: string,
    topicId?: string,
    subtopicId?: string,
    levelIdOrExpectedLevel?: string,
    limit: number = 3,
    excludeIds: string[] = [],
  ): Promise<any[]> {
    const shuffle = (array: string[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };

    // Object-level authorization: restrict results to topics visible to this
    // tenant, using the identical hide-list rule Catalogs applies. Passed to
    // every bank search below (primary AND the level fallback).
    const hiddenTopicIds = await this.getHiddenTopicIds();

    const primaryIds = await this.flatQuestionsRepo.searchQuestionIds({
      courseId,
      topicId,
      subtopicId,
      level: levelIdOrExpectedLevel || null,
      excludeIds,
      excludeTopicIds: hiddenTopicIds,
      limit,
    });
    let selectedIds = shuffle(primaryIds).slice(0, limit);

    if (selectedIds.length < limit && levelIdOrExpectedLevel) {
      const remainingLimit = limit - selectedIds.length;
      const combinedExcludeIds = [...excludeIds, ...selectedIds];

      const fallbackIds = await this.flatQuestionsRepo.searchQuestionIds({
        courseId,
        topicId,
        subtopicId,
        level: null,
        excludeIds: combinedExcludeIds,
        excludeTopicIds: hiddenTopicIds,
        limit,
      });
      selectedIds = [
        ...selectedIds,
        ...shuffle(fallbackIds).slice(0, remainingLimit),
      ];
    }

    if (selectedIds.length === 0) {
      return [];
    }

    const flatQuestions = await this.flatQuestionsRepo.findByIds(selectedIds);

    return await Promise.all(
      flatQuestions.map((flatQ: any) => this.mapFlatQuestion(flatQ)),
    );
  }
}
