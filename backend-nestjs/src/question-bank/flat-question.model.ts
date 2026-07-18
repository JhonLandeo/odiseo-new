/**
 * Anti-corruption model: the shape the B2B side consumes from the question bank.
 * It deliberately mirrors only the columns the SaaS reads from the bank's
 * `flat_questions` view, decoupling the rest of the codebase from the bank's
 * physical schema. All jsonb payloads stay loosely typed on purpose — their
 * internal structure belongs to the bank, not to us.
 */
export interface FlatQuestion {
  question_id: number | string;
  code?: string;
  level_id?: number;
  level_name?: string;
  type?: string;
  html_content?: string;
  alternatives?: any[];
  config_alternative?: any;
  images?: any[];
  solution?: {
    diagrammed?: any[];
    diagrammed_images?: any[];
    didi_maths?: any[];
  } | null;
  origins?: Record<string, any> | null;
  math_formulas?: any[];
  alternative_maths?: any[];
}

export interface FlatQuestionSearchFilters {
  courseId?: string;
  topicId?: string;
  subtopicId?: string;
  /** Difficulty label (EASY/MEDIUM/HARD/…) or a raw numeric level id as string. */
  level?: string | null;
  excludeIds?: string[];
}
