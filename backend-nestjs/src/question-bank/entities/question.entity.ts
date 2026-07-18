import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { Alternative } from './alternative.entity';

export interface QuestionOption {
  label: string;
  text: string;
  is_correct: boolean;
}

@Entity({ schema: 'odiseo', name: 'question' })
export class Question {
  @PrimaryColumn('bigint')
  id: string;

  @Column({ name: 'topic_id', type: 'bigint' })
  topicId: string;

  @Column({ name: 'subtopic_id', type: 'bigint' })
  subtopicId: string;

  @Column({ name: 'answer_id', type: 'bigint', nullable: true })
  answerId: string;

  @Column({ name: 'level_id', type: 'smallint', nullable: true })
  levelId: number;

  @Column({ name: 'description', type: 'text' })
  htmlContent: string;

  @OneToMany(() => Alternative, (alternative) => alternative.question)
  alternatives: Alternative[];

  /**
   * Correctness derivation source #2 (the normalized-entity path). Correctness
   * is single-sourced here from `answer_id === alternative.id`; there is no
   * view `is_correct` to reconcile against on this path, so no cross-check is
   * needed or possible without extra data. Note the failure modes this getter
   * produces for downstream consumers: a null `answer_id`, or an `answer_id`
   * matching no alternative, both yield ZERO options flagged `is_correct`.
   * Uniqueness/absence of the correct alternative is detected centrally at the
   * answer-key assembly point (`resolveAnswerKeyLetter` in
   * `pdf-generator.service.ts`), not here, to keep this getter pure.
   */
  get options(): QuestionOption[] {
    if (!this.alternatives) return [];

    const sorted = [...this.alternatives].sort(
      (a, b) => Number(a.id) - Number(b.id),
    );

    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    return sorted.map((alt, index) => ({
      label: labels[index] || String.fromCharCode(65 + index),
      text: alt.text,
      is_correct: String(alt.id) === String(this.answerId),
    }));
  }
}
