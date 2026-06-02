import { Injectable, UnauthorizedException, ForbiddenException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../entities/user.entity';
import { Employee } from '../../entities/employee.entity';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

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
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
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

    // 端口隔离仅保留"非 owner 不可从总后台入口登录"这一道反向保护，
    // owner 角色现在允许从主前端入口登录（统一到 Next.js）。
    const ownerPort = Number(this.configService.get('OWNER_PORT', 3001));
    if (requestPort === ownerPort && user.role !== 'owner') {
      throw new UnauthorizedException({ message: '这个入口是总后台，请使用总后台账号登录' });
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

  logout(token: string): void {
    sessions.delete(token);
  }
}
