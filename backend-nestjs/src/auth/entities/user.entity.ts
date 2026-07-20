import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../tenants/entities/tenant.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column()
  name: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /**
   * Set whenever the password on this account was chosen by someone who is not
   * its owner. While it is true the account can do nothing but change its own
   * password — see PasswordResetGuard. Never carried in the JWT: it is read on
   * every request so revoking or lifting it takes effect immediately.
   */
  @Column({ name: 'force_password_reset', default: false })
  forcePasswordReset: boolean;

  /**
   * Set to NOW() by AuthService.revokeUserTokens whenever this user's
   * authority or account state changes (password change, deactivation,
   * credential reset, role assignment/update/delete) or they log out. NULL
   * means the account has never had its tokens revoked. JwtAuthGuard rejects
   * any token whose `iat` (issued-at) claim predates this timestamp, even one
   * that has not otherwise expired — see getUserAuthState/JwtAuthGuard for the
   * comparison. Durable (Postgres-backed) so revocation survives a Redis
   * restart/eviction, unlike the permission cache alone.
   */
  @Column({ name: 'tokens_valid_after', type: 'timestamptz', nullable: true })
  tokensValidAfter: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
