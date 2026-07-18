import { NotFoundException } from '@nestjs/common';
import { GetMaterialQuestionsUseCase } from './get-material-questions.use-case';

/**
 * Object-level authorization for the GLOBAL question bank.
 *
 * These specs pin the tenant visibility gate to the EXACT rule Catalogs uses:
 * a hide-list over a default-visible catalogue. A topic is invisible to a
 * tenant ONLY when an explicit `tenant_topic_visibility` row sets
 * `is_active = false`; an absent row means visible. The gate must therefore
 * (a) leave the legitimate happy path untouched and (b) deny only questions
 * whose every topic is on that hide-list.
 */
describe('GetMaterialQuestionsUseCase visibility gate', () => {
  // FlatQuestionsRepository test double: only the methods the use-case calls.
  const makeFlatRepo = () => ({
    findTopicIdsForQuestion: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findByIdFromNormalized: jest.fn().mockResolvedValue(null),
    findByIds: jest.fn().mockResolvedValue([]),
    searchQuestionIds: jest.fn().mockResolvedValue([]),
  });

  const makeGcs = () => ({
    getSignedUrl: jest.fn().mockResolvedValue('https://signed/url'),
  });

  // TenantService test double: runInTenant invokes the operation with a fake
  // manager whose `query` returns the hidden rows, exactly as the real service
  // would after setting the tenant search_path. Captures the SQL so a test can
  // prove the query matches the Catalogs `is_active = false` rule.
  const makeTenantService = (hiddenTopicIds: Array<string | number>) => {
    const query = jest
      .fn()
      .mockResolvedValue(hiddenTopicIds.map((id) => ({ topic_id: id })));
    return {
      query,
      runInTenant: jest.fn((op: any) => op({ query })),
    };
  };

  const build = (opts: {
    hidden: Array<string | number>;
    flat?: ReturnType<typeof makeFlatRepo>;
  }) => {
    const flatRepo = opts.flat ?? makeFlatRepo();
    const gcs = makeGcs();
    const tenant = makeTenantService(opts.hidden);
    const useCase = new GetMaterialQuestionsUseCase(
      flatRepo as any,
      gcs as any,
      tenant as any,
    );
    return { useCase, flatRepo, gcs, tenant };
  };

  const aFlatQuestion = (id: number) => ({
    question_id: id,
    code: `Q${id}`,
    level_id: 1,
    level_name: 'Easy',
    type: 'single',
    html_content: '<p>?</p>',
    alternatives: [],
    images: [],
    solution: null,
    origins: null,
  });

  describe('getHiddenTopicIds query (matches Catalogs hide-list rule)', () => {
    it('selects exactly the rows where is_active = false', async () => {
      const { useCase, tenant } = build({ hidden: [] });
      await useCase.getQuestionAlternatives('10');
      const [sql] = tenant.query.mock.calls[0];
      expect(sql).toContain('tenant_topic_visibility');
      expect(sql).toContain('is_active = false');
    });
  });

  describe('getQuestionPreview', () => {
    it('rejects a non-numeric id before any lookup', async () => {
      const { useCase, flatRepo } = build({ hidden: [] });
      await expect(useCase.getQuestionPreview('abc')).rejects.toThrow(
        'ID de pregunta inválido',
      );
      expect(flatRepo.findTopicIdsForQuestion).not.toHaveBeenCalled();
    });

    it('allows a question whose topic IS visible (happy path unchanged)', async () => {
      const flat = makeFlatRepo();
      flat.findTopicIdsForQuestion.mockResolvedValue(['42']);
      flat.findById.mockResolvedValue(aFlatQuestion(7));
      // Topic 99 is hidden, but the question lives in the visible topic 42.
      const { useCase } = build({ hidden: ['99'], flat });

      const result = await useCase.getQuestionPreview('7');

      expect(result.id).toBe('7');
      expect(flat.findById).toHaveBeenCalledWith(7);
    });

    it('allows every question when the tenant hides nothing (default-visible)', async () => {
      const flat = makeFlatRepo();
      flat.findTopicIdsForQuestion.mockResolvedValue(['42']);
      flat.findById.mockResolvedValue(aFlatQuestion(7));
      const { useCase } = build({ hidden: [], flat });

      await expect(useCase.getQuestionPreview('7')).resolves.toMatchObject({
        id: '7',
      });
    });

    it('denies a question whose only topic is hidden, without fetching it', async () => {
      const flat = makeFlatRepo();
      flat.findTopicIdsForQuestion.mockResolvedValue(['99']);
      const { useCase } = build({ hidden: ['99'], flat });
      const loggerWarn = jest
        .spyOn((useCase as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await expect(useCase.getQuestionPreview('7')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      // The out-of-scope question is never fetched or signed.
      expect(flat.findById).not.toHaveBeenCalled();
      // A cross-scope denial is logged with ids only.
      expect(loggerWarn).toHaveBeenCalledTimes(1);
      const [msg] = loggerWarn.mock.calls[0];
      expect(msg).toContain('questionId=7');
      expect(msg).toContain('99');
    });

    it('allows a question with one hidden and one visible topic', async () => {
      const flat = makeFlatRepo();
      flat.findTopicIdsForQuestion.mockResolvedValue(['99', '42']);
      flat.findById.mockResolvedValue(aFlatQuestion(7));
      const { useCase } = build({ hidden: ['99'], flat });

      await expect(useCase.getQuestionPreview('7')).resolves.toMatchObject({
        id: '7',
      });
    });

    it('leaves a question with no resolvable topic visible (default-visible)', async () => {
      const flat = makeFlatRepo();
      flat.findTopicIdsForQuestion.mockResolvedValue([]);
      flat.findById.mockResolvedValue(aFlatQuestion(7));
      const { useCase } = build({ hidden: ['99'], flat });

      await expect(useCase.getQuestionPreview('7')).resolves.toMatchObject({
        id: '7',
      });
    });
  });

  describe('getQuestionAlternatives', () => {
    it('forwards the tenant hide-list to the bank search as excludeTopicIds', async () => {
      const flat = makeFlatRepo();
      flat.searchQuestionIds.mockResolvedValue([]);
      const { useCase } = build({ hidden: ['99', '100'], flat });

      await useCase.getQuestionAlternatives('10', '42');

      expect(flat.searchQuestionIds).toHaveBeenCalledWith(
        expect.objectContaining({ excludeTopicIds: ['99', '100'] }),
      );
    });

    it('forwards the hide-list to the level fallback search too', async () => {
      const flat = makeFlatRepo();
      // Primary returns fewer than the limit so the fallback path runs.
      flat.searchQuestionIds
        .mockResolvedValueOnce([]) // primary
        .mockResolvedValueOnce([]); // fallback
      const { useCase } = build({ hidden: ['99'], flat });

      // A level triggers the fallback branch when primary is short.
      await useCase.getQuestionAlternatives('10', '42', undefined, 'EASY', 3);

      expect(flat.searchQuestionIds).toHaveBeenCalledTimes(2);
      for (const call of flat.searchQuestionIds.mock.calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({ excludeTopicIds: ['99'] }),
        );
      }
    });

    it('returns only questions from visible topics (gate applied end to end)', async () => {
      const flat = makeFlatRepo();
      // The bank, honoring excludeTopicIds, returns just the visible-topic id.
      flat.searchQuestionIds.mockResolvedValue(['5']);
      flat.findByIds.mockResolvedValue([aFlatQuestion(5)]);
      const { useCase } = build({ hidden: ['99'], flat });

      const result = await useCase.getQuestionAlternatives('10', '42');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('5');
    });
  });
});
