import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Teacher } from '../../entities/teacher.entity';
import { makeId } from '../../shared/utils/id-generator';

/** 质量评分只允许 A / B / C */
const VALID_SCORES = ['A', 'B', 'C'];

function parseScore(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const v = String(raw).trim().toUpperCase();
  if (!VALID_SCORES.includes(v)) {
    throw new BadRequestException('质量评分只允许 A / B / C');
  }
  return v;
}

export interface CreateTeacherInput {
  name: string;
  phone?: string | null;
  wechat?: string | null;
  specialty?: string | null;
  direction?: string | null;
  stability?: string;
  qualityScore?: string | null;
  remark?: string | null;
}

export interface UpdateTeacherInput {
  name?: string;
  phone?: string | null;
  wechat?: string | null;
  specialty?: string | null;
  direction?: string | null;
  stability?: string;
  qualityScore?: string | null;
  remark?: string | null;
  status?: string;
}

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher)
    private readonly repo: Repository<Teacher>,
  ) {}

  /**
   * 查询老师列表，支持关键字搜索（姓名/专业能力/接单方向）。
   */
  async findAll(keyword = ''): Promise<Teacher[]> {
    const where = keyword
      ? [
          { name: Like(`%${keyword}%`) },
          { specialty: Like(`%${keyword}%`) },
          { direction: Like(`%${keyword}%`) },
        ]
      : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * 分页查询老师列表。
   */
  async findAllPaged(limit: number, offset: number, keyword = ''): Promise<{ items: Teacher[]; total: number; limit: number; offset: number }> {
    const where = keyword
      ? [
          { name: Like(`%${keyword}%`) },
          { specialty: Like(`%${keyword}%`) },
          { direction: Like(`%${keyword}%`) },
        ]
      : {};
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total, limit, offset };
  }

  async findOne(id: string): Promise<Teacher> {
    const t = await this.repo.findOneBy({ id });
    if (!t) throw new NotFoundException(`老师 ${id} 不存在`);
    return t;
  }

  async create(input: CreateTeacherInput): Promise<Teacher> {
    if (!input.name?.trim()) throw new BadRequestException('老师姓名不能为空');
    const t = this.repo.create({
      id: makeId(),
      name: input.name.trim(),
      phone: input.phone || null,
      wechat: input.wechat || null,
      specialty: input.specialty || null,
      direction: input.direction || null,
      stability: (input.stability as any) || 'new',
      qualityScore: parseScore(input.qualityScore),
      remark: input.remark || null,
    });
    return this.repo.save(t);
  }

  async update(id: string, input: UpdateTeacherInput): Promise<Teacher> {
    const t = await this.findOne(id);
    if (input.name !== undefined) t.name = input.name;
    if (input.phone !== undefined) t.phone = input.phone;
    if (input.wechat !== undefined) t.wechat = input.wechat;
    if (input.specialty !== undefined) t.specialty = input.specialty;
    if (input.direction !== undefined) t.direction = input.direction;
    if (input.stability !== undefined) t.stability = input.stability as any;
    if (input.qualityScore !== undefined) t.qualityScore = parseScore(input.qualityScore);
    if (input.remark !== undefined) t.remark = input.remark;
    if (input.status !== undefined) t.status = input.status as any;
    return this.repo.save(t);
  }

  async remove(id: string): Promise<void> {
    const t = await this.findOne(id);
    await this.repo.remove(t);
  }
}
