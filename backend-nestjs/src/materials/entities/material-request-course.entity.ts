import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MaterialRequest } from './material-request.entity';
import { Course } from '../../catalogs/entities/course.entity';

export enum CourseMaterialStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  COMPLETED_WITH_WARNINGS = 'COMPLETED_WITH_WARNINGS',
  EMPTY_BANK = 'EMPTY_BANK',
  FAILED = 'FAILED',
}

@Entity('material_request_courses')
export class MaterialRequestCourse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'material_request_id', type: 'uuid' })
  materialRequestId: string;

  @Column({ name: 'course_id', type: 'bigint' })
  courseId: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: Course;

  @Column({
    type: 'enum',
    enum: CourseMaterialStatus,
    default: CourseMaterialStatus.PENDING,
  })
  status: CourseMaterialStatus;

  @Column({ name: 'download_url', nullable: true, type: 'text' })
  downloadUrl: string;

  @Column({ name: 'key_download_url', nullable: true, type: 'text' })
  keyDownloadUrl: string | null;

  @Column({ name: 'solution_download_url', nullable: true, type: 'text' })
  solutionDownloadUrl: string | null;

  @Column({ type: 'jsonb', nullable: true })
  warnings: any;

  // Billing pipeline (spec 008 FR-007): recorded atomically with the
  // completion webhook, straight off the in-memory PDF Buffer at generation
  // time (see PdfGenerationProcessor). NULL for rows generated before tenant
  // migration 0010 and for non-success terminal states — the monthly
  // collector cron treats NULL as 0 via COALESCE.
  @Column({ name: 'page_count', type: 'int', nullable: true })
  pageCount: number | null;

  @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
  fileSizeBytes: number | null;

  // Set in the SAME atomic update as pageCount/fileSizeBytes, when the course
  // reaches a success-terminal state. `createdAt` is request-submission time,
  // not generation-completion time, and the monthly billing collector scopes
  // `pdf_pages_generated` by completion month — using `createdAt` there would
  // silently drop a course whose generation crosses a month boundary.
  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(
    () => MaterialRequest,
    (request: MaterialRequest) => request.courses,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'material_request_id' })
  materialRequest: MaterialRequest;
}
