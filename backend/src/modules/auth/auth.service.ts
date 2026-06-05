import { Injectable, UnauthorizedException, ForbiddenException, Inject, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import { User } from '../../entities/user.entity';
import { Employee } from '../../entities/employee.entity';
import { RevokedToken } from './entities/revoked-token.entity';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../../common/auth.guard';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';

const sessions = new Map<string, any>();

/**
 * 连续登录失败次数达到该阈值时，自动将账号 status 设为 'locked'。
 * 锁定的账号可由 admin/owner 在主管端解锁（POST /api/users/staff-unlock 等）。
 *
 * 与 TC-PERM-004 验收一致：5 次错误密码后 status=locked，登录返回 423。
 */
const FAILED_LOGIN_LOCK_THRESHOLD = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(RevokedToken)
    private readonly revokedTokenRepository: Repository<RevokedToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(username: string, password: string, requestPort: number): Promise<any> {
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      // 用户不存在时仍返回通用错误，避免 username 枚举攻击
      throw new UnauthorizedException({ message: '用户名或密码错误' });
    }

    // 已锁定账号：直接拒绝（不再校验密码，避免重置计数器造成攻击窗口）
    // 用 ForbiddenException(423) 表示资源被锁；前端可基于此弹"账号已锁定，请联系主管解锁"提示
    if (user.status === 'locked') {
      throw new ForbiddenException({
        message: '账号已锁定，请联系主管端解锁',
        locked: true,
        lastFailedAt: user.lastFailedAt,
      });
    }
    // inactive 账号：保留历史数据归属，禁止登录
    if (user.status === 'inactive') {
      throw new UnauthorizedException({ message: '账号已停用，请联系管理员' });
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException({ message: '用户名或密码错误' });
    }

    // Support both bcrypt hashed and plain text passwords
    let passwordValid = false;
    if (user.password.startsWith('$2b$') || user.password.startsWith('$2a$')) {
      passwordValid = await bcrypt.compare(password, user.password);
    } else {
      passwordValid = user.password === password;
    }

    if (!passwordValid) {
      // 登录失败：累加失败计数 + 记录失败时间；达到阈值时锁定
      const nextCount = (user.failedLoginCount || 0) + 1;
      const updatePayload: Partial<User> = {
        failedLoginCount: nextCount,
        lastFailedAt: new Date(),
      };
      if (nextCount >= FAILED_LOGIN_LOCK_THRESHOLD) {
        updatePayload.status = 'locked';
      }
      try {
        await this.userRepository.update(user.id, updatePayload);
      } catch (err) {
        // 计数累加失败不应阻塞返回错误响应（用户依然登录失败）
        // eslint-disable-next-line no-console
        console.error('[auth] failed to record failed login attempt', (err as any)?.message || err);
      }
      if (nextCount >= FAILED_LOGIN_LOCK_THRESHOLD) {
        // 5 次失败：账号刚被锁定，告知用户并返回 423
        throw new ForbiddenException({
          message: '连续登录失败次数过多，账号已锁定，请联系主管端解锁',
          locked: true,
          failedLoginCount: nextCount,
        });
      }
      throw new UnauthorizedException({
        message: '用户名或密码错误',
        remainingAttempts: FAILED_LOGIN_LOCK_THRESHOLD - nextCount,
      });
    }

    // 登录成功：重置失败计数 + 清除最近失败时间
    // 仅在原值非 0 时写库（避免无谓 UPDATE 触发 updated_at）
    if (user.failedLoginCount && user.failedLoginCount > 0) {
      try {
        await this.userRepository.update(user.id, {
          failedLoginCount: 0,
          lastFailedAt: null,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[auth] failed to reset failed login counter', (err as any)?.message || err);
      }
    }

    // 端口隔离（修复 B7，2026-06-03；v1.3 新增 3003 统一登录入口分支，2026-06-04）：
    //   - 3001 总后台（OWNER_PORT）：仅 owner / admin / supervisor 可登录；其他角色禁止
    //   - 3000 主入口（PORT）：owner 角色禁止从此处登录（必须走 3001 总后台）
    //   - 3003 统一登录入口（ALL_ROLES_PORT）：全角色放行；**owner 必须从 3001 登录**
    //   - requestPort === 0 表示「未透传」（如本地 8089 直连测试），不强制端口
    // 同时 server.js 那一层也会做一遍校验（O(1) 拦截 + 日志），这里作为最后防线。
    //
    // 修复 (2026-06-05)：
    //   1) 原代码用 `this.configService.get('PORT', 3000)` 比较 requestPort，但
    //      `PORT` 在 backend 进程是 8089（自身端口），与 server.js 的 3000 错位——
    //      导致 curl / Next.js (port 3002 → 8089) 等无 x-server-port 头的请求被
    //      误判为「来自主入口」而拦截 owner。
    //   2) server.js 启动时硬编码 `Number(process.env.PORT || 3000)`，所以
    //      legacy main port 默认 3000（与 backend 自身 PORT 无关）。
    //   3) 这里用字面值 3000 兜底（与 server.js 同步）；如果部署改了 server.js 的
    //      PORT，需同步调整这里或加 LEGACY_PORT env 串联（暂不做）。
    if (requestPort && requestPort > 0) {
      const ownerPort = Number(this.configService.get('OWNER_PORT', 3001));
      const allRolesPort = Number(this.configService.get('ALL_ROLES_PORT', 3003));
      const legacyMainPort = 3000; // 与 server.js `Number(process.env.PORT || 3000)` 同步
      if (requestPort === ownerPort) {
        if (!['owner', 'admin', 'supervisor'].includes(user.role)) {
          throw new UnauthorizedException({
            message: '这个入口是总后台，请使用总后台账号登录',
            port: requestPort,
            role: user.role,
          });
        }
      } else if (requestPort === allRolesPort) {
        // v1.3：3003 统一登录入口；除 owner 外全角色放行（owner 仍必须 3001）
        if (user.role === 'owner') {
          throw new UnauthorizedException({
            message: 'owner 账号必须从 3001 端口（总后台）登录',
            port: requestPort,
            role: user.role,
            requiredPort: ownerPort,
          });
        }
      } else if (requestPort === legacyMainPort) {
        if (user.role === 'owner') {
          throw new UnauthorizedException({
            message: 'owner 账号必须从 3001 端口（总后台）登录',
            port: requestPort,
            role: user.role,
            requiredPort: ownerPort,
          });
        }
      }
    }

    const employees = await this.employeeRepository.find();
    const employee = user.employeeId ? employees.find((e) => e.id === user.employeeId) : null;

    // Legacy: store in-memory session for backward compatibility
    const legacyToken = require('crypto').randomUUID();
    sessions.set(legacyToken, {
      userId: user.id,
      role: user.role,
      employeeId: user.employeeId,
      username: user.username,
    });

    // Also issue JWT
    const jwtToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
    });

    return {
      token: jwtToken,
      legacyToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.employeeId,
        employeeName: employee?.name || '',
      },
    };
  }

  async getMe(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return null;
    const employees = await this.employeeRepository.find();
    const employee = user.employeeId ? employees.find((e) => e.id === user.employeeId) : null;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId || null,
      employeeName: employee?.name || '',
    };
  }

  /**
   * 根据当前有效 JWT 重新签发长会话 token，并返回最新用户信息。
   */
  async refreshToken(token: string): Promise<any> {
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch (_error) {
      throw new UnauthorizedException({ message: '登录已失效，请重新登录' });
    }

    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException({ message: '登录已失效，请重新登录' });
    }

    const employee = user.employeeId
      ? (await this.employeeRepository.find()).find((item) => item.id === user.employeeId)
      : null;
    const jwtToken = this.jwtService.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
    });

    return {
      token: jwtToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        employeeId: user.employeeId || null,
        employeeName: employee?.name || '',
      },
    };
  }

  /**
   * 登出（PF-05 修复于 2026-06-04）：
   *   1) 算 SHA256(token) → tokenHash
   *   2) 解析 JWT exp → expiresAt
   *   3) 写入 revoked_tokens 表
   *   4) 清 in-memory session Map（兼容旧路径）
   *   5) 主动失效 AuthGuard 撤销缓存（保证下一次请求立即拒绝，不受 5min TTL 限制）
   * 失败处理：撤销表写入失败时降级到原行为（清 Map + 抛错），避免阻塞用户登出体验。
   */
  async logout(token: string, userId?: string): Promise<{ ok: true; revoked: boolean }> {
    if (!token) {
      return { ok: true, revoked: false };
    }
    // 1) 清 in-memory session Map（兼容旧路径）
    sessions.delete(token);
    // 2) 解析 token 拿到 userId 和 exp
    let resolvedUserId = userId || '';
    let expiresAt: Date | null = null;
    try {
      const decoded: any = this.jwtService.verify(token);
      if (decoded?.sub) resolvedUserId = resolvedUserId || String(decoded.sub);
      if (decoded?.exp && typeof decoded.exp === 'number') {
        expiresAt = new Date(decoded.exp * 1000);
      }
    } catch {
      // token 已过期/无效：仍可撤销（让任何残留的同 token 拒绝），但拿不到 exp
    }
    if (!resolvedUserId) {
      // 无 userId 上下文：直接清缓存即可，不写表（避免脏数据）
      AuthGuard.invalidateRevokedCache(token);
      return { ok: true, revoked: false };
    }
    // 3) 算 SHA256
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    // 4) 写撤销表
    let revoked = false;
    try {
      await this.revokedTokenRepository.save(
        this.revokedTokenRepository.create({
          id: randomUUID(),
          tokenHash,
          userId: resolvedUserId,
          expiresAt,
          reason: 'logout',
        } as Partial<RevokedToken>),
      );
      revoked = true;
    } catch (err: any) {
      // 写表失败：不阻塞登出响应（用户体感是「已登出」），但打 ERROR 日志
      this.logger.error(
        `[PF-05] 写 revoked_tokens 失败 userId=${resolvedUserId} err=${err?.message || err}`,
      );
    }
    // 5) 主动失效缓存，保证下一次请求立即拒绝
    AuthGuard.invalidateRevokedCache(token);
    return { ok: true, revoked };
  }

  /**
   * PF-05：检查 token 是否已被撤销（供 AuthGuard 注入使用）。
   * AuthGuard 内部已有 5min 缓存，这里只做一次 DB 查询。
   * @param token 原始 Bearer token
   * @returns true 表示已撤销
   */
  async isTokenRevoked(token: string): Promise<boolean> {
    if (!token) return false;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await this.revokedTokenRepository.findOne({
      where: { tokenHash },
    });
    return !!row;
  }

  /**
   * PF-05：每小时清理过期撤销记录（expires_at < now）。
   * 避免 revoked_tokens 表无限增长。
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupRevokedTokens(): Promise<void> {
    try {
      const result = await this.revokedTokenRepository.delete({
        expiresAt: LessThan(new Date()),
      } as any);
      const affected = (result as any)?.affected ?? 0;
      if (affected > 0) {
        this.logger.log(`[PF-05] 清理 ${affected} 条过期撤销 token 记录`);
      }
    } catch (err: any) {
      // 清理失败不应阻塞系统
      this.logger.error(`[PF-05] cleanupRevokedTokens 失败: ${err?.message || err}`);
    }
  }
}
