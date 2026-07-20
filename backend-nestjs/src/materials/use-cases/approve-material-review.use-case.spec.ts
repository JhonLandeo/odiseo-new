import { ConflictException } from '@nestjs/common';
import { ApproveMaterialReviewUseCase } from './approve-material-review.use-case';
import { MaterialRequest } from '../entities/material-request.entity';
import { Company } from '../../tenants/entities/tenant.entity';
import { CycleMaterialTemplate } from '../../academic-time/entities/cycle-material-template.entity';
import { Syllabus } from '../../syllabus/entities/syllabus.entity';
import { SyllabusDistribution } from '../../syllabus/entities/syllabus-distribution.entity';
import { MaterialReviewQuestion } from '../entities/material-review-question.entity';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

describe('ApproveMaterialReviewUseCase', () => {
  let useCase: ApproveMaterialReviewUseCase;
  let queue: any;
  let manager: any;
  let request: any;
  let company: any;
  /** Bumps that the conditional UPDATE should report as successful. */
  let versionBumpAffected: number;

  const dto = (overrides: any = {}) =>
    ({
      version: 3,
      replacements: [],
      removals: [{ id: 'removed-slot' }].map((r) => r.id),
      continueWithWarnings: false,
      ...overrides,
    }) as any;

  beforeEach(() => {
    versionBumpAffected = 1;

    request = {
      id: 'req-1',
      version: 3,
      cycleId: 'cycle-1',
      weekNumber: 4,
      profileId: 'profile-1',
      designTemplateId: 'design-1',
      materialId: 'material-1',
      materialType: 'BALOTARIO',
      // Not yet generated, so approval must go down the regeneration path.
      courses: [
        {
          id: 'course-req-1',
          courseId: 'course-1',
          downloadUrl: null,
          keyDownloadUrl: null,
          solutionDownloadUrl: null,
          warnings: null,
        },
      ],
    };

    company = {
      id: TENANT_ID,
      commercialName: 'Academia Real',
      logoUrl: 'https://cdn.example.com/academia-real.png',
    };

    manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === MaterialRequest) return request;
        // The company lookup is keyed on the tenant; the assertions below check
        // which id it actually received.
        if (entity === Company) return company;
        if (entity === CycleMaterialTemplate) {
          return { id: 'profile-1', name: 'Balotario Semanal', scope: 'CURRENT_WEEK' };
        }
        if (entity === Syllabus) return { id: 'syllabus-1' };
        return null;
      }),
      find: jest.fn(async (entity: any) => {
        if (entity === MaterialReviewQuestion) return [];
        if (entity === SyllabusDistribution) {
          return [{ topicId: 't-1', subtopicId: 's-1', questionCount: 5 }];
        }
        return [];
      }),
      update: jest.fn(async (entity: any, criteria: any) => {
        // Only the optimistic guard targets MaterialRequest by {id, version}.
        if (entity === MaterialRequest && criteria?.version !== undefined) {
          return { affected: versionBumpAffected };
        }
        return { affected: 1 };
      }),
      save: jest.fn(async (x: any) => x),
    };

    queue = { add: jest.fn().mockResolvedValue(undefined) };

    const tenantService: any = {
      runInTenant: jest.fn(async (cb: any) => cb(manager)),
    };

    useCase = new ApproveMaterialReviewUseCase(tenantService, queue);
  });

  const dispatchedJob = () => queue.add.mock.calls[0][1];

  describe('actor and tenancy context (Fix 1)', () => {
    it('looks the company up by tenantId, not by the acting user id', async () => {
      await useCase.execute('req-1', dto(), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      const companyLookup = manager.findOne.mock.calls.find(
        ([entity]: any[]) => entity === Company,
      );
      expect(companyLookup).toBeDefined();
      expect(companyLookup[1].where.id).toBe(TENANT_ID);
      expect(companyLookup[1].where.id).not.toBe(USER_ID);
    });

    it('brands the job with the real company and never the hardcoded fallback', async () => {
      await useCase.execute('req-1', dto(), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      const job = dispatchedJob();
      expect(job.tenant.commercial_name).toBe('Academia Real');
      expect(job.tenant.logo_url).toBe(
        'https://cdn.example.com/academia-real.png',
      );
      expect(job.tenant.commercial_name).not.toBe('Colegio Odiseo Innova');
    });

    it('routes tenant_id and the notification recipient to distinct ids', async () => {
      await useCase.execute('req-1', dto(), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      const job = dispatchedJob();
      expect(job.tenant_id).toBe(TENANT_ID);
      expect(job.tenant.tenant_id).toBe(TENANT_ID);
      // The admin to notify is the approving user, not the company.
      expect(job.notification.admin_user_id).toBe(USER_ID);
    });
  });

  describe('material type propagation (Fix 2)', () => {
    it('keeps a PRACTICA request a PRACTICA through approval', async () => {
      request.materialType = 'PRACTICA';

      await useCase.execute('req-1', dto(), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(dispatchedJob().material_type).toBe('PRACTICA');
    });

    it('carries a BALOTARIO request through unchanged', async () => {
      request.materialType = 'BALOTARIO';

      await useCase.execute('req-1', dto(), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(dispatchedJob().material_type).toBe('BALOTARIO');
    });

    it('falls back to BALOTARIO only when the request stored no type', async () => {
      request.materialType = null;

      await useCase.execute('req-1', dto(), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(dispatchedJob().material_type).toBe('BALOTARIO');
    });
  });

  describe('optimistic concurrency (Fix 4)', () => {
    it('bumps the version atomically instead of only comparing it', async () => {
      await useCase.execute('req-1', dto({ version: 3 }), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      const guard = manager.update.mock.calls.find(
        ([entity, criteria]: any[]) =>
          entity === MaterialRequest && criteria?.version !== undefined,
      );
      expect(guard).toBeDefined();
      expect(guard[1]).toEqual({ id: 'req-1', version: 3 });
      // The bump must be an expression evaluated by the database, so the
      // read and the write cannot be interleaved by a concurrent approval.
      expect(typeof guard[2].version).toBe('function');
      expect(guard[2].version()).toBe('"version" + 1');
    });

    it('rejects a stale version and enqueues nothing', async () => {
      versionBumpAffected = 0;

      await expect(
        useCase.execute('req-1', dto({ version: 2 }), {
          tenantId: TENANT_ID,
          userId: USER_ID,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('lets the second of two concurrent approvals lose', async () => {
      // Both admins read version=3. The database awards the bump once.
      let remainingBumps = 1;
      manager.update = jest.fn(async (entity: any, criteria: any) => {
        if (entity === MaterialRequest && criteria?.version !== undefined) {
          const affected = remainingBumps > 0 ? 1 : 0;
          remainingBumps -= 1;
          return { affected };
        }
        return { affected: 1 };
      });

      const first = await useCase.execute('req-1', dto({ version: 3 }), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });
      expect(first.status).toBeDefined();

      await expect(
        useCase.execute('req-1', dto({ version: 3 }), {
          tenantId: TENANT_ID,
          userId: USER_ID,
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      // Exactly one generation was enqueued, not two.
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('queue dispatch (Fix 3 / Fix 5 options)', () => {
    it('dispatches only after the transaction callback resolves', async () => {
      let addCallsAtCommit = -1;
      const tenantService: any = {
        runInTenant: jest.fn(async (cb: any) => {
          const res = await cb(manager);
          addCallsAtCommit = queue.add.mock.calls.length;
          return res;
        }),
      };
      useCase = new ApproveMaterialReviewUseCase(tenantService, queue);

      await useCase.execute('req-1', dto(), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(addCallsAtCommit).toBe(0);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('enqueues with retry and retention bounds', async () => {
      await useCase.execute('req-1', dto(), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      const opts = queue.add.mock.calls[0][2];
      expect(opts.attempts).toBe(3);
      expect(opts.backoff.type).toBe('exponential');
      expect(opts.removeOnComplete).toBeDefined();
      expect(opts.removeOnFail).toBeDefined();
    });
  });

  describe('saveDraft', () => {
    it('accepts the same named context object as execute', async () => {
      const res = await useCase.saveDraft('req-1', dto(), {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(res.status).toBe('OK');
    });

    it('rejects a stale draft version', async () => {
      versionBumpAffected = 0;

      await expect(
        useCase.saveDraft('req-1', dto({ version: 2 }), {
          tenantId: TENANT_ID,
          userId: USER_ID,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
