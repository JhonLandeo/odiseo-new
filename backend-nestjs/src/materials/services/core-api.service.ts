import { Injectable, Logger } from '@nestjs/common';
import { QuestionBankService } from '../../question-bank/question-bank.service';
import { FlatQuestionsRepository } from '../../question-bank/flat-questions.repository';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { GcsService } from '../../gcs/gcs.service';
import { Cycle } from '../../academic-time/entities/cycle.entity';

export interface ExtractedQuestion {
  id: string;
  topicId: string;
  subtopicId: string;
  code?: string;
  content: string;
  options: {
    label: string;
    text: string;
    isCorrect: boolean;
  }[];
  levelId?: number;
  levelName?: string;
  type?: string;
  configAlternative?: {
    columns: number;
    styles: string;
    flImage: boolean;
  };
  images?: { id: string; url: string }[];
  mathFormulas?: { id: string; code: string; path: string; properties: any }[];
  alternativeMaths?: {
    id: string;
    code: string;
    path: string;
    properties: any;
  }[];
  solution?: {
    diagrammed: {
      id: string;
      value: string;
      position: number;
      field_diagram: string;
    }[];
    diagrammedImages: { id: string; url: string }[];
    didiMaths: { id: string; code: string; path: string; properties: any }[];
  };
  textOrigin?: string;
}

@Injectable()
export class CoreApiService {
  private readonly logger = new Logger(CoreApiService.name);

  constructor(
    private readonly questionBankService: QuestionBankService,
    private readonly flatQuestionsRepo: FlatQuestionsRepository,
    private readonly gcsService: GcsService,
    @InjectEntityManager()
    private readonly defaultEntityManager: EntityManager,
  ) {}

  /**
   * Rejects if any image URL cannot be signed, and that rejection must keep
   * propagating. `GcsService.getSignedUrl` no longer degrades to `''` after its
   * bounded retry — an empty `src` used to ship exams with missing question
   * images while the job still reported `completed`. The only caller is
   * `PdfGenerationProcessor`, whose per-course `catch` turns this into a
   * `failed` webhook and fails the job. Do not wrap these calls in a catch that
   * substitutes a placeholder URL.
   */
  async fetchQuestions(
    topicId: string,
    subtopicId: string,
    quantity: number,
    excludeIds: string[],
    tenantId?: string,
    cycleId?: string,
  ): Promise<ExtractedQuestion[]> {
    this.logger.log(
      `Fetching ${quantity} questions for topic ${topicId}, subtopic ${subtopicId}. Excluded: ${excludeIds.length}`,
    );

    const dbQuestions = await this.questionBankService.getRandomQuestions(
      subtopicId,
      quantity,
      excludeIds,
    );

    const filteredQuestions = dbQuestions.filter(
      (q) => !excludeIds.includes(q.id),
    );

    if (filteredQuestions.length === 0) return [];

    const questionIds = filteredQuestions.map((q) => q.id);
    const flatQuestions = await this.flatQuestionsRepo.findByIds(questionIds);

    const cycle = cycleId
      ? await this.defaultEntityManager.findOne(Cycle, {
          where: { id: cycleId },
        })
      : null;
    const universityId = cycle?.universityId;

    const results: ExtractedQuestion[] = [];
    const flatQuestionMap = new Map<string, any>(
      flatQuestions.map((q: any) => [String(q.question_id), q]),
    );

    for (const q of filteredQuestions) {
      const flatQ: any = flatQuestionMap.get(String(q.id));
      if (!flatQ) continue;

      const signedImages = await Promise.all(
        (flatQ.images || []).map(async (img: any) => ({
          id: img.id,
          url: await this.gcsService.getSignedUrl(img.gcs_key),
        })),
      );

      const signedDiagImages = await Promise.all(
        (flatQ.solution?.diagrammed_images || []).map(async (img: any) => ({
          id: img.id,
          url: await this.gcsService.getSignedUrl(img.gcs_key),
        })),
      );

      const textOrigin =
        universityId && flatQ.origins ? flatQ.origins[universityId] : null;

      results.push({
        id: String(flatQ.question_id),
        topicId: q.topicId || topicId,
        subtopicId: q.subtopicId || subtopicId,
        code: flatQ.code,
        content: flatQ.html_content,
        options: (flatQ.alternatives || []).map((alt: any) => ({
          label: alt.label,
          text: alt.text,
          isCorrect: alt.is_correct,
        })),
        configAlternative: flatQ.config_alternative,
        images: signedImages,
        mathFormulas: flatQ.math_formulas || [],
        alternativeMaths: flatQ.alternative_maths || [],
        solution: {
          diagrammed: flatQ.solution?.diagrammed || [],
          diagrammedImages: signedDiagImages,
          didiMaths: flatQ.solution?.didi_maths || [],
        },
        textOrigin: textOrigin || 'Desconocido',
      });
    }

    return results;
  }
}
