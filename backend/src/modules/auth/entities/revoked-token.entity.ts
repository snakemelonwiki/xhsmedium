import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * 撤销的 JWT token（PF-05 修复于 2026-06-04）。
 *
 * 背景：
 *   原 auth.service.logout() 只清 in-memory Map，JWT 本身仍可在 8h 过期前通过 verify，
 *   导致登出后凭据仍可用 24h 窗口（依 JWT_EXPIRES_IN 配置）。
 *
 * 修复方案：
 *   1) logout 时算 SHA256(token) → 写入本表
 *   2) AuthGuard 在 verify 通过后查本表，命中则 401
 *   3) 5min 内存缓存避免每请求查 DB
 *   4) 后台 @Cron 每小时清理 expires_at < now() 的过期记录
 *
 * 注意：
 *   - token_hash 索引长度 64（SHA256 hex），原 token 永不落库
 *   - expires_at 存原 token 的 exp 时间（毫秒转秒后）；后台清理时用 < now 即可
 */
@Entity('revoked_tokens')
@Index('idx_revoked_tokens_token', ['tokenHash'])
@Index('idx_revoked_tokens_user', ['userId'])
@Index('idx_revoked_tokens_expires', ['expiresAt'])
export class RevokedToken {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  @CreateDateColumn({ name: 'revoked_at' })
  revokedAt: Date;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'varchar', length: 32, default: 'logout' })
  reason: string;
}
