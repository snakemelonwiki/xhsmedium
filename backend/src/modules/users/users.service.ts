import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { makeId } from '../../shared/utils/id-generator';
import * as bcrypt from 'bcrypt';

/**
 * 序列化 User 时过滤敏感字段（password）。
 * 用于直接返回给 HTTP 响应的辅助方法 —— 不返回 password 哈希/明文。
 */
function toSafeUser(u: User): Record<string, any> {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    employeeId: u.employeeId,
    status: u.status,
    capacityPaused: Boolean((u as any).capacityPaused),
    capacityPausedAt: (u as any).capacityPausedAt ?? null,
    createdAt: (u as any).createdAt,
    updatedAt: (u as any).updatedAt,
  };
}

/**
 * B 端 1.2 P1-02 修复：新建/更新账号时统一走 bcrypt 哈希存储。
 * 已存在的明文账号继续兼容（auth.service 已支持双轨比对），不会因为本修复被破坏。
 *
 * - 输入已经是 $2a$ / $2b$ 开头 → 视为已哈希，原样写入
 * - 其它（含 7 字符明文 test123）→ bcrypt.hash(pw, 10) 后写入
 *
 * 同步：把 newCount/lastFailedAt 之类附加字段写入路径也保留；与 P1-01 失败计数兼容。
 */
function normalizePasswordForStorage(password: string | undefined | null): string {
  const raw = String(password || '');
  if (!raw) return raw;
  if (raw.startsWith('$2a$') || raw.startsWith('$2b$')) return raw;
  return bcrypt.hashSync(raw, 10);
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<any[]> {
    const rows = await this.userRepository.find({ order: { createdAt: 'DESC' } });
    // B/P0-05: 响应中绝不能包含 password 字段。统一在 service 层 map
    return rows.map(toSafeUser);
  }

  /**
   * 查询可分配销售账号候选，仅返回 active sales 的安全字段。
   * 同时从 employees 表加载真实姓名（employeeName）供下拉展示。
   * 包含容量上限状态（capacityPaused），惰性自动恢复超过1小时的记录。
   */
  async findAssignableSalesUsersPaged(options: { limit: number; offset: number }): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(options.limit);
    const safeOffset = Math.max(Number(options.offset) || 0, 0);

    const disabledStatuses = ['离职', '停用', 'inactive', 'disabled', 'leave', 'resign', 'stopped'];
    const statusPlaceholders = disabledStatuses.map(() => '?').join(',');

    // 每个员工只保留一个最新创建的有效销售账号，避免同一员工绑定多个 sales 账号导致下拉框数量多于员工管理列表
    const rows: Array<{
      id: string | number;
      username: string;
      role: string;
      employeeId: string | number;
      status: string;
      capacityPaused: number;
      capacityPausedAt: Date | string | null;
      createdAt: Date | string;
      employeeName: string;
    }> = await this.userRepository.manager.query(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        u.employee_id AS employeeId,
        u.status,
        u.capacity_paused AS capacityPaused,
        u.capacity_paused_at AS capacityPausedAt,
        u.created_at AS createdAt,
        e.name AS employeeName
      FROM users u
      INNER JOIN employees e ON u.employee_id = e.id COLLATE utf8mb4_unicode_ci
      WHERE u.role = ?
        AND u.status = 'active'
        AND e.status NOT IN (${statusPlaceholders})
        AND u.id = (
          SELECT u2.id
          FROM users u2
          WHERE u2.employee_id = u.employee_id
            AND u2.role = 'sales'
            AND u2.status = 'active'
          ORDER BY u2.created_at DESC, u2.id DESC
          LIMIT 1
        )
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
      `,
      ['sales', ...disabledStatuses, safeLimit, safeOffset],
    );

    const countResult: Array<{ total: number }> = await this.userRepository.manager.query(
      `
      SELECT COUNT(DISTINCT u.employee_id) AS total
      FROM users u
      INNER JOIN employees e ON u.employee_id = e.id COLLATE utf8mb4_unicode_ci
      WHERE u.role = ?
        AND u.status = 'active'
        AND e.status NOT IN (${statusPlaceholders})
      `,
      ['sales', ...disabledStatuses],
    );
    const total = Number(countResult[0]?.total) || 0;

    // 惰性自动恢复：检查 capacity_paused_at 超过1小时的记录
    const now = new Date();
    const ONE_HOUR_MS = 60 * 60 * 1000;
    for (const u of rows) {
      if (u.capacityPaused && u.capacityPausedAt) {
        const elapsed = now.getTime() - new Date(u.capacityPausedAt).getTime();
        if (elapsed > ONE_HOUR_MS) {
          // 自动恢复
          await this.userRepository.update(String(u.id), {
            capacityPaused: 0 as any,
            capacityPausedAt: null as any,
          });
          u.capacityPaused = 0 as any;
          u.capacityPausedAt = null as any;
        }
      }
    }

    return {
      items: rows.map((u) => ({
        id: String(u.id),
        username: u.username,
        role: u.role,
        employeeId: u.employeeId ? String(u.employeeId) : null,
        status: u.status,
        employeeName: u.employeeName ?? null,
        capacityPaused: Boolean(u.capacityPaused),
        capacityPausedAt: u.capacityPausedAt ? new Date(u.capacityPausedAt).toISOString() : null,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
      })),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  /**
   * 切换销售的客资容量上限状态。
   * 仅允许 sales 角色自行操作，其他人不可干预。
   */
  async toggleCapacityPaused(userId: string): Promise<{ capacityPaused: boolean; capacityPausedAt: Date | null }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('用户不存在');
    }
    if (user.role !== 'sales') {
      throw new Error('仅销售角色可操作客资上限状态');
    }

    const currentlyPaused = Boolean(user.capacityPaused);
    const nextPaused = !currentlyPaused;
    const updates: any = {
      capacityPaused: nextPaused ? 1 : 0,
      capacityPausedAt: nextPaused ? new Date() : null,
    };
    await this.userRepository.update(userId, updates);

    return {
      capacityPaused: nextPaused,
      capacityPausedAt: nextPaused ? updates.capacityPausedAt : null,
    };
  }

  /**
   * 查询单个用户的容量上限状态（含惰性自动恢复）。
   */
  async getCapacityStatus(userId: string): Promise<{ capacityPaused: boolean; capacityPausedAt: Date | null }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('用户不存在');
    }

    // 惰性自动恢复
    if (user.capacityPaused && user.capacityPausedAt) {
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const elapsed = new Date().getTime() - new Date(user.capacityPausedAt).getTime();
      if (elapsed > ONE_HOUR_MS) {
        await this.userRepository.update(userId, {
          capacityPaused: 0 as any,
          capacityPausedAt: null as any,
        });
        return { capacityPaused: false, capacityPausedAt: null };
      }
    }

    return {
      capacityPaused: Boolean(user.capacityPaused),
      capacityPausedAt: user.capacityPausedAt ?? null,
    };
  }

  async findStaffUsers(): Promise<any[]> {
    const rows = await this.userRepository.find({
      where: { role: 'staff' },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toSafeUser);
  }

  async findAllPaged(options: { limit: number; offset: number }): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(options.limit);
    const safeOffset = Math.max(Number(options.offset) || 0, 0);
    const [rows, total] = await this.userRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: safeOffset,
      take: safeLimit,
    });
    return {
      items: rows.map(toSafeUser),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  async findStaffUsersPaged(options: { limit: number; offset: number }): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(options.limit);
    const safeOffset = Math.max(Number(options.offset) || 0, 0);
    const [rows, total] = await this.userRepository.findAndCount({
      where: { role: 'staff' },
      order: { createdAt: 'DESC' },
      skip: safeOffset,
      take: safeLimit,
    });
    return {
      items: rows.map(toSafeUser),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  private clampLimit(limit: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  async create(dto: Partial<User>): Promise<any> {
    const user = this.userRepository.create({
      ...dto,
      id: makeId(),
      password: normalizePasswordForStorage(dto.password),
    } as any);
    return this.userRepository.save(user);
  }

  async upsertStaffUser(dto: {
    id: string;
    username: string;
    password: string;
    employeeId: string;
    status: string;
  }): Promise<void> {
    const hashedPassword = normalizePasswordForStorage(dto.password);
    // 查询该员工已有的任意登录账号（不限制 role），避免同一 employeeId 下创建多个 user 导致显示错乱
    const existing = await this.userRepository.findOne({
      where: { employeeId: dto.employeeId },
    });
    if (existing) {
      // 更新已有账号时保留原始 role，不将其修改为 'staff'
      await this.userRepository.update(existing.id, {
        username: dto.username,
        password: hashedPassword,
        status: dto.status,
      });
    } else {
      await this.create({
        id: dto.id || makeId(),
        username: dto.username,
        password: hashedPassword,
        role: 'staff',
        employeeId: dto.employeeId,
        status: dto.status,
      });
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async update(id: string, dto: Partial<User>): Promise<void> {
    const updates: any = {};
    if (dto.username !== undefined) updates.username = dto.username;
    if (dto.password !== undefined) updates.password = normalizePasswordForStorage(dto.password);
    if (dto.employeeId !== undefined) updates.employeeId = dto.employeeId;
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.role !== undefined) updates.role = dto.role;
    await this.userRepository.update(id, updates);
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.userRepository.update(id, { status });
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    await this.userRepository.update(id, { password: newPassword });
  }
}
