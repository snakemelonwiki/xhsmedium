import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { Teacher, TEACHER_EDUCATION_OPTIONS, TEACHER_TUTORING_TYPES, TEACHER_QUALITY_LEVELS } from '../../entities/teacher.entity';
import { TeacherSpecialty } from '../../entities/teacher-specialty.entity';
import { TeacherOrderType } from '../../entities/teacher-order-type.entity';
import { makeId } from '../../shared/utils/id-generator';

/** 质量评分：兼容旧格式 A/B/C 与新格式 优秀/一般/差 */
const VALID_SCORES = ['A', 'B', 'C', '优秀', '一般', '差'];

function parseScore(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const v = String(raw).trim();
  // 旧格式大写转换
  const normalized = v.length === 1 ? v.toUpperCase() : v;
  if (!VALID_SCORES.includes(normalized)) {
    throw new BadRequestException('质量评分只允许 A/B/C 或 优秀/一般/差');
  }
  return normalized;
}

/** 校验学历枚举值 */
function validateEducation(val: string | null | undefined): string | null {
  if (!val) return null;
  const v = String(val).trim();
  if (!(TEACHER_EDUCATION_OPTIONS as readonly string[]).includes(v)) {
    throw new BadRequestException(`学历值不合法: ${v}，允许值: ${TEACHER_EDUCATION_OPTIONS.join('/')}`);
  }
  return v;
}

/** 校验辅导类型枚举值 */
function validateTutoringType(val: string | null | undefined): string | null {
  if (!val) return null;
  const v = String(val).trim();
  if (!(TEACHER_TUTORING_TYPES as readonly string[]).includes(v)) {
    throw new BadRequestException(`辅导类型值不合法: ${v}，允许值: ${TEACHER_TUTORING_TYPES.join('/')}`);
  }
  return v;
}

/** 校验质量等级枚举值（A-4 规范）：优秀 / 一般 / 差 */
function validateQualityLevel(val: string | null | undefined): string | null {
  if (!val) return null;
  const v = String(val).trim();
  if (!(TEACHER_QUALITY_LEVELS as readonly string[]).includes(v)) {
    throw new BadRequestException(`质量等级值不合法: ${v}，允许值: ${TEACHER_QUALITY_LEVELS.join('/')}`);
  }
  return v;
}

export interface CreateTeacherInput {
  name: string;
  phone?: string | null;
  wechat?: string | null;
  school?: string | null;
  education?: string | null;
  researchArea?: string | null;
  specialty?: string | null;
  direction?: string | null;
  tutoringType?: string | null;
  imageUrl?: string | null;
  stability?: string;
  qualityScore?: string | null;
  qualityLevel?: string | null;
  remark?: string | null;
}

export interface UpdateTeacherInput {
  name?: string;
  phone?: string | null;
  wechat?: string | null;
  school?: string | null;
  education?: string | null;
  researchArea?: string | null;
  specialty?: string | null;
  direction?: string | null;
  tutoringType?: string | null;
  imageUrl?: string | null;
  stability?: string;
  qualityScore?: string | null;
  qualityLevel?: string | null;
  remark?: string | null;
  status?: string;
}

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher)
    private readonly repo: Repository<Teacher>,
    @InjectRepository(TeacherSpecialty)
    private readonly specialtyRepo: Repository<TeacherSpecialty>,
    @InjectRepository(TeacherOrderType)
    private readonly orderTypeRepo: Repository<TeacherOrderType>,
  ) {}

  /**
   * 将老师列表中的 specialty / direction ID 字段解析为可读的名称字段。
   * 结果通过 Object.assign 附加到原对象上，不破坏原始 ID 字段（编辑场景仍需 ID）。
   */
  private async resolveTeacherNames(items: Teacher[]): Promise<Teacher[]> {
    if (items.length === 0) return items;

    const specialtyIds = new Set<string>();
    const orderTypeIds = new Set<string>();
    for (const item of items) {
      if (item.specialty) {
        item.specialty.split(/[、,]/).map((s) => s.trim()).filter(Boolean).forEach((id) => specialtyIds.add(id));
      }
      if (item.direction) {
        item.direction.split(/[、,]/).map((s) => s.trim()).filter(Boolean).forEach((id) => orderTypeIds.add(id));
      }
    }

    const [specialties, orderTypes] = await Promise.all([
      specialtyIds.size > 0
        ? this.specialtyRepo.findBy({ id: In(Array.from(specialtyIds).map((id) => Number(id))) })
        : Promise.resolve<TeacherSpecialty[]>([]),
      orderTypeIds.size > 0
        ? this.orderTypeRepo.findBy({ id: In(Array.from(orderTypeIds).map((id) => Number(id))) })
        : Promise.resolve<TeacherOrderType[]>([]),
    ]);

    const specialtyMap = new Map(specialties.map((s) => [String(s.id), s.name]));
    const orderTypeMap = new Map(orderTypes.map((t) => [String(t.id), t.name]));

    for (const item of items) {
      const specialtyNames = item.specialty
        ? item.specialty.split(/[、,]/).map((s) => s.trim()).filter(Boolean)
            .map((id) => specialtyMap.get(id) || id)
            .filter(Boolean)
            .join('、')
        : null;
      const directionNames = item.direction
        ? item.direction.split(/[、,]/).map((s) => s.trim()).filter(Boolean)
            .map((id) => orderTypeMap.get(id) || id)
            .filter(Boolean)
            .join('、')
        : null;
      Object.assign(item, { specialtyNames, directionNames });
    }

    return items;
  }

  /**
   * 查询老师列表，支持关键字搜索（姓名/专业能力/接单方向/学校）。
   * @param specialty 专业方向 ID（teacher_specialties.id）；按包含匹配（ID 列表形如 "1,3,5"）。
   */
  async findAll(keyword = '', specialty = ''): Promise<Teacher[]> {
    const id = String(specialty || '').trim();
    const kw = String(keyword || '').trim();
    if (id) {
      // 专业筛选走 QueryBuilder：把存储里的 "1,3,5" / "1、3、5" 统一规整为 "1,3,5" 再加逗号包，
      // 匹配 ",1," 子串，避免子串误匹配（例如 ID=1 命中 "12,34"）。
      const qb = this.repo.createQueryBuilder('t');
      qb.where(
        `CONCAT(',', REPLACE(REPLACE(REPLACE(COALESCE(t.specialty, ''), '、', ','), '，', ','), ' ', ''), ',') LIKE :sid`,
        { sid: `%,${id},%` },
      );
      if (kw) {
        qb.andWhere(
          `(t.name LIKE :kw OR t.specialty LIKE :kw OR t.direction LIKE :kw OR t.school LIKE :kw OR t.researchArea LIKE :kw)`,
          { kw: `%${kw}%` },
        );
      }
      qb.orderBy('t.createdAt', 'DESC');
      const items = await qb.getMany();
      return this.resolveTeacherNames(items);
    }
    const where = kw
      ? [
          { name: Like(`%${kw}%`) },
          { specialty: Like(`%${kw}%`) },
          { direction: Like(`%${kw}%`) },
          { school: Like(`%${kw}%`) },
          { researchArea: Like(`%${kw}%`) },
        ]
      : {};
    const items = await this.repo.find({ where, order: { createdAt: 'DESC' } });
    return this.resolveTeacherNames(items);
  }

  /**
   * 分页查询老师列表。
   * @param specialty 专业方向 ID（teacher_specialties.id）；按包含匹配（ID 列表形如 "1,3,5"）。
   */
  async findAllPaged(
    limit: number,
    offset: number,
    keyword = '',
    specialty = '',
  ): Promise<{ items: Teacher[]; total: number; limit: number; offset: number }> {
    const id = String(specialty || '').trim();
    const kw = String(keyword || '').trim();
    if (id) {
      const qb = this.repo.createQueryBuilder('t');
      qb.where(
        `CONCAT(',', REPLACE(REPLACE(REPLACE(COALESCE(t.specialty, ''), '、', ','), '，', ','), ' ', ''), ',') LIKE :sid`,
        { sid: `%,${id},%` },
      );
      if (kw) {
        qb.andWhere(
          `(t.name LIKE :kw OR t.specialty LIKE :kw OR t.direction LIKE :kw OR t.school LIKE :kw OR t.researchArea LIKE :kw)`,
          { kw: `%${kw}%` },
        );
      }
      qb.orderBy('t.createdAt', 'DESC')
        .take(limit)
        .skip(offset);
      const [items, total] = await qb.getManyAndCount();
      await this.resolveTeacherNames(items);
      return { items, total, limit, offset };
    }
    const where = kw
      ? [
          { name: Like(`%${kw}%`) },
          { specialty: Like(`%${kw}%`) },
          { direction: Like(`%${kw}%`) },
          { school: Like(`%${kw}%`) },
          { researchArea: Like(`%${kw}%`) },
        ]
      : {};
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    await this.resolveTeacherNames(items);
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
      school: input.school || null,
      education: validateEducation(input.education),
      researchArea: input.researchArea || null,
      specialty: input.specialty || null,
      direction: input.direction || null,
      tutoringType: validateTutoringType(input.tutoringType),
      imageUrl: input.imageUrl || null,
      stability: (input.stability as any) || 'new',
      qualityScore: parseScore(input.qualityScore),
      qualityLevel: validateQualityLevel(input.qualityLevel),
      remark: input.remark || null,
    });
    return this.repo.save(t);
  }

  async update(id: string, input: UpdateTeacherInput): Promise<Teacher> {
    const t = await this.findOne(id);
    if (input.name !== undefined) t.name = input.name;
    if (input.phone !== undefined) t.phone = input.phone;
    if (input.wechat !== undefined) t.wechat = input.wechat;
    if (input.school !== undefined) t.school = input.school;
    if (input.education !== undefined) t.education = validateEducation(input.education);
    if (input.researchArea !== undefined) t.researchArea = input.researchArea;
    if (input.specialty !== undefined) t.specialty = input.specialty;
    if (input.direction !== undefined) t.direction = input.direction;
    if (input.tutoringType !== undefined) t.tutoringType = validateTutoringType(input.tutoringType);
    if (input.imageUrl !== undefined) t.imageUrl = input.imageUrl;
    if (input.stability !== undefined) t.stability = input.stability as any;
    if (input.qualityScore !== undefined) t.qualityScore = parseScore(input.qualityScore);
    if (input.qualityLevel !== undefined) t.qualityLevel = validateQualityLevel(input.qualityLevel);
    if (input.remark !== undefined) t.remark = input.remark;
    if (input.status !== undefined) t.status = input.status as any;
    return this.repo.save(t);
  }

  async remove(id: string): Promise<void> {
    const t = await this.findOne(id);
    await this.repo.remove(t);
  }
}
