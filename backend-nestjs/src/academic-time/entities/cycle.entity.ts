import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm';
import { CycleWeek } from './cycle-week.entity';

@Entity({ name: 'cycles' })
export class Cycle {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'integer' })
  year: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date | string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date | string;

  @Column({ name: 'days_per_week', type: 'integer' })
  daysPerWeek: number;

  @Column({ name: 'total_weeks', type: 'integer' })
  totalWeeks: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'university_id', type: 'uuid', nullable: true })
  universityId: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deletedAt: Date;

  @OneToMany(() => CycleWeek, (week) => week.cycle)
  weeks: CycleWeek[];
}
