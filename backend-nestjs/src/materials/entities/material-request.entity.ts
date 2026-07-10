import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  VersionColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MaterialRequestCourse } from './material-request-course.entity';
import { MaterialReviewQuestion } from './material-review-question.entity';
import { PdfDesignTemplate } from './pdf-design-template.entity';
import { MaterialRequestStatus } from './material-status.enum';
import { Material } from './material.entity';
import { Cycle } from '../../academic-time/entities/cycle.entity';

@Entity('material_requests')
export class MaterialRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @ManyToOne(() => Cycle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cycle_id' })
  cycle: Cycle;

  @Column({ name: 'week_number', type: 'int' })
  weekNumber: number;

  @Column({
    type: 'enum',
    enum: MaterialRequestStatus,
    default: MaterialRequestStatus.PENDING,
  })
  status: MaterialRequestStatus;

  @Column({ name: 'requires_review', default: false })
  requiresReview: boolean;

  @Column({ name: 'material_type', type: 'varchar', nullable: true, length: 50 })
  materialType: string | null;

  @Column({ name: 'design_template_id', nullable: true, type: 'uuid' })
  designTemplateId: string | null;

  @ManyToOne(() => PdfDesignTemplate, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'design_template_id' })
  designTemplate: PdfDesignTemplate | null;

  @Column({ name: 'material_id', nullable: true, type: 'uuid' })
  materialId: string | null;

  @ManyToOne(() => Material, (material: Material) => material.requests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'material_id' })
  material: Material | null;

  @Column({ name: 'merged_download_url', nullable: true, type: 'text' })
  mergedDownloadUrl: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @VersionColumn()
  version: number;

  @OneToMany(() => MaterialRequestCourse, (course: MaterialRequestCourse) => course.materialRequest, {
    cascade: true,
  })
  courses: MaterialRequestCourse[];

  @OneToMany(
    () => MaterialReviewQuestion,
    (question: MaterialReviewQuestion) => question.materialRequest,
    { cascade: true },
  )
  reviewQuestions: MaterialReviewQuestion[];
}
