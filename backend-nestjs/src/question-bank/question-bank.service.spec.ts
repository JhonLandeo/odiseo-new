import { QuestionBankService } from './question-bank.service';

describe('QuestionBankService', () => {
  const makeService = (questionRepo: any = {}) =>
    new QuestionBankService(questionRepo, {} as any);

  describe('getQuestionsByIds', () => {
    it('short-circuits to [] for empty input without querying', async () => {
      const find = jest.fn();
      const service = makeService({ find });

      await expect(service.getQuestionsByIds([])).resolves.toEqual([]);
      expect(find).not.toHaveBeenCalled();
    });

    it('loads questions with their alternatives for the given ids', async () => {
      const rows = [{ id: '1' }];
      const find = jest.fn().mockResolvedValue(rows);
      const service = makeService({ find });

      const result = await service.getQuestionsByIds(['1', '2']);

      expect(result).toBe(rows);
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ relations: ['alternatives'] }),
      );
    });
  });

  describe('getSubtopicQuestionMappings', () => {
    it('short-circuits to [] for empty input', async () => {
      const service = makeService({ manager: {} });
      await expect(service.getSubtopicQuestionMappings([])).resolves.toEqual(
        [],
      );
    });
  });
});
