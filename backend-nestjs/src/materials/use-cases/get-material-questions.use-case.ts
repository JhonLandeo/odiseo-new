import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { GcsService } from '../../gcs/gcs.service';
import { FlatQuestionsRepository } from '../../question-bank/flat-questions.repository';


@Injectable()
export class GetMaterialQuestionsUseCase {
  constructor(
    private readonly flatQuestionsRepo: FlatQuestionsRepository,
    private readonly gcsService: GcsService,
  ) {}

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

    const primaryIds = await this.flatQuestionsRepo.searchQuestionIds({
      courseId,
      topicId,
      subtopicId,
      level: levelIdOrExpectedLevel || null,
      excludeIds,
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
      });
      selectedIds = [...selectedIds, ...shuffle(fallbackIds).slice(0, remainingLimit)];
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
