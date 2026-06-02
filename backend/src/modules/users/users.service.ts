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
   */
  async findAssignableSalesUsersPaged(options: { limit: number; offset: number }): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(options.limit);
    const safeOffset = Math.max(Number(options.offset) || 0, 0);
    const [rows, total] = await this.userRepository.findAndCount({
      where: { role: 'sales', status: 'active' },
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
    const existing = await this.userRepository.findOne({
      where: { employeeId: dto.employeeId, role: 'staff' },
    });
    if (existing) {
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
}
