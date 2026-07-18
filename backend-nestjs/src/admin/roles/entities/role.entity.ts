import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_system_default', default: false })
  isSystemDefault: boolean;

  @Column({ type: 'jsonb', default: [] })
  permissions: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToMany(() => Role)
  @JoinTable({
    name: 'role_inheritance',
    joinColumn: { name: 'child_role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'parent_role_id', referencedColumnName: 'id' },
  })
  inheritedRoles: Role[];
}
