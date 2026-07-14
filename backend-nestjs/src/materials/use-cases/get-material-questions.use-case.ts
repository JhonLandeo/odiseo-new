import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { GcsService } from '../../gcs/gcs.service';


@Injectable()
export class GetMaterialQuestionsUseCase {
  constructor(
    @InjectEntityManager('questionsConnection')
    private readonly questionsEntityManager: EntityManager,
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

    let flatQ: any = null;
    const flatQuestions = await this.questionsEntityManager.query(
      `SELECT * FROM odiseo.flat_questions WHERE question_id = $1`,
      [dbQuestionId],
    );

    if (flatQuestions.length > 0) {
      flatQ = flatQuestions[0];
    } else {
      const fallbackDbQuestions = await this.questionsEntityManager.query(
        `SELECT q.id as question_id, q.code, q.level_id, l.name as level_name, q.type, q.description as html_content,
           (SELECT json_agg(json_build_object('id', a.id, 'description', a.description, 'is_correct', a.id = q.answer_id)) 
            FROM odiseo.alternative a WHERE a.question_id = q.id AND a.fl_status = true) as alternatives,
           (SELECT json_agg(json_build_object('id', qi.id, 'code', qi.code, 'gcs_key', qi.image)) 
            FROM odiseo.question_image qi WHERE qi.question_id = q.id AND qi.fl_status = true) as images
         FROM odiseo.question q
         LEFT JOIN odiseo.level l ON q.level_id = l.id
         WHERE q.id = $1 AND q.fl_status = true`,
        [dbQuestionId],
      );

      if (fallbackDbQuestions.length === 0) {
        throw new NotFoundException('Pregunta no encontrada');
      }

      const fq = fallbackDbQuestions[0];
      const alts = fq.alternatives || [];
      flatQ = {
        question_id: fq.question_id,
        code: fq.code,
        level_id: fq.level_id,
        level_name: fq.level_name,
        type: fq.type,
        html_content: fq.html_content,
        alternatives: alts.map((alt: any, idx: number) => ({
          id: alt.id,
          label: String.fromCharCode(65 + idx),
          text: alt.description,
          is_correct: alt.is_correct
        })),
        images: fq.images || [],
        solution: null
      };
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
    const buildIdQuery = (levelFilter: string | null, excludedQuestionIds: string[]) => {
      let sql = `
        SELECT fq.question_id 
        FROM odiseo.flat_questions fq
        INNER JOIN odiseo.question_subtopic qs ON fq.question_id = qs.question_id
        INNER JOIN odiseo.subtopic s ON qs.subtopic_id = s.id
        ${courseId ? 'INNER JOIN odiseo.topic t ON s.topic_id = t.id' : ''}
        WHERE qs.fl_status = true
      `;
      const queryParams: any[] = [];

      if (subtopicId) {
        const subtopicIds = subtopicId.split(',').filter(Boolean);
        if (subtopicIds.length > 0) {
          const numericSubtopicIds = subtopicIds.map(Number);
          sql += ` AND s.id IN (${numericSubtopicIds.map((_, i) => `\$${queryParams.length + 1 + i}`).join(', ')})`;
          queryParams.push(...numericSubtopicIds);
        }
      } else if (topicId) {
        const topicIds = topicId.split(',').filter(Boolean);
        if (topicIds.length > 0) {
          const numericTopicIds = topicIds.map(Number);
          sql += ` AND s.topic_id IN (${numericTopicIds.map((_, i) => `\$${queryParams.length + 1 + i}`).join(', ')})`;
          queryParams.push(...numericTopicIds);
        }
      } else if (courseId) {
        const courseIds = courseId.split(',').filter(Boolean);
        if (courseIds.length > 0) {
          const numericCourseIds = courseIds.map(Number);
          sql += ` AND t.course_id IN (${numericCourseIds.map((_, i) => `\$${queryParams.length + 1 + i}`).join(', ')})`;
          queryParams.push(...numericCourseIds);
        }
      }

      if (levelFilter) {
        const upperDiff = String(levelFilter).toUpperCase();
        if (upperDiff === 'EASY' || upperDiff === 'FACIL') {
          sql += ` AND fq.level_id IN (43, 44)`;
        } else if (upperDiff === 'MEDIUM' || upperDiff === 'INTERMEDIO') {
          sql += ` AND fq.level_id = 45`;
        } else if (upperDiff === 'HARD' || upperDiff === 'DIFICIL') {
          sql += ` AND fq.level_id IN (46, 47, 48, 49, 50, 51, 52)`;
        } else {
          sql += ` AND fq.level_id = $${queryParams.length + 1}`;
          queryParams.push(Number(levelFilter));
        }
      }

      if (excludedQuestionIds.length > 0) {
        const numericExcludeIds = excludedQuestionIds
          .map(id => {
            const num = Number(id);
            return isNaN(num) ? Number(id) : num;
          })
          .filter(id => !isNaN(id));
        if (numericExcludeIds.length > 0) {
          sql += ` AND fq.question_id NOT IN (${numericExcludeIds.map((_, i) => `\$${queryParams.length + 1 + i}`).join(', ')})`;
          queryParams.push(...numericExcludeIds);
        }
      }

      return { sql, queryParams };
    };

    const shuffle = (array: any[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };

    const primarySearch = buildIdQuery(levelIdOrExpectedLevel || null, excludeIds);
    const primaryIdRows = await this.questionsEntityManager.query(primarySearch.sql, primarySearch.queryParams);
    
    let allPrimaryIds = primaryIdRows.map((r: any) => String(r.question_id));
    shuffle(allPrimaryIds);
    let selectedIds = allPrimaryIds.slice(0, limit);

    if (selectedIds.length < limit && levelIdOrExpectedLevel) {
      const remainingLimit = limit - selectedIds.length;
      const combinedExcludeIds = [...excludeIds, ...selectedIds];
      
      const fallbackSearch = buildIdQuery(null, combinedExcludeIds);
      const fallbackIdRows = await this.questionsEntityManager.query(fallbackSearch.sql, fallbackSearch.queryParams);
      
      let fallbackIds = fallbackIdRows.map((r: any) => String(r.question_id));
      shuffle(fallbackIds);
      
      selectedIds = [...selectedIds, ...fallbackIds.slice(0, remainingLimit)];
    }

    if (selectedIds.length === 0) {
      return [];
    }

    const numericSelectedIds = selectedIds.map((id: any) => Number(id)).filter((id: any) => !isNaN(id));
    const flatQuestions = await this.questionsEntityManager.query(
      `SELECT * FROM odiseo.flat_questions WHERE question_id = ANY($1)`,
      [numericSelectedIds]
    );

    return await Promise.all(
      flatQuestions.map((flatQ: any) => this.mapFlatQuestion(flatQ))
    );
  }
}
