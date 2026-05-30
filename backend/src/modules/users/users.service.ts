import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { makeId } from '../../shared/utils/id-generator';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<any[]> {
    return this.userRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findStaffUsers(): Promise<any[]> {
    return this.userRepository.find({ where: { role: 'staff' }, order: { createdAt: 'DESC' } });
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
      items: rows.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        employeeId: u.employeeId,
        status: u.status,
      })),
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
      items: rows.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        employeeId: u.employeeId,
        status: u.status,
      })),
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
    const existing = await this.userRepository.findOne({
      where: { employeeId: dto.employeeId, role: 'staff' },
    });
    if (existing) {
      await this.userRepository.update(existing.id, {
        username: dto.username,
        password: dto.password,
        status: dto.status,
      });
    } else {
      await this.create({
        id: dto.id || makeId(),
        username: dto.username,
        password: dto.password,
        role: 'staff',
        employeeId: dto.employeeId,
        status: dto.status,
      });
    }
  }
}
