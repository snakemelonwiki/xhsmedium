import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { TeacherOrderType } from '../../entities/teacher-order-type.entity';
import { Teacher } from '../../entities/teacher.entity';

@Injectable()
export class TeacherOrderTypesService {
  constructor(
    @InjectRepository(TeacherOrderType)
    private readonly repo: Repository<TeacherOrderType>,
    @InjectRepository(Teacher)
    private readonly teacherRepo: Repository<Teacher>,
  ) {}

  async findAll(
    keyword = '',
    page?: number,
    pageSize?: number,
  ): Promise<TeacherOrderType[] | { items: TeacherOrderType[]; total: number; page: number; pageSize: number }> {
    const where = keyword ? { name: Like(`%${keyword}%`) } : {};
    if (page === undefined && pageSize === undefined) {
      return this.repo.find({ where, order: { id: 'ASC' } });
    }

    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { id: 'ASC' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    });
    return { items, total, page: safePage, pageSize: safePageSize };
  }

  async findOne(id: number): Promise<TeacherOrderType> {
    const item = await this.repo.findOneBy({ id });
    if (!item) throw new NotFoundException('接单类型不存在');
    return item;
  }

  async create(name: string): Promise<TeacherOrderType> {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new BadRequestException('名称不能为空');
    const existing = await this.repo.findOneBy({ name: trimmed });
    if (existing) throw new BadRequestException('该接单类型已存在');
    return this.repo.save(this.repo.create({ name: trimmed }));
  }

  async update(id: number, name: string): Promise<TeacherOrderType> {
    const item = await this.findOne(id);
    const trimmed = (name || '').trim();
    if (!trimmed) throw new BadRequestException('名称不能为空');
    const dup = await this.repo.findOneBy({ name: trimmed });
    if (dup && dup.id !== id) throw new BadRequestException('该接单类型名称已存在');
    item.name = trimmed;
    return this.repo.save(item);
  }

  async remove(id: number): Promise<void> {
    const item = await this.findOne(id);
    const used = await this.countUsedTeachers(id);
    if (used > 0) {
      throw new BadRequestException(
        `该接单类型已被 ${used} 位老师使用，请先删除或修改关联老师后再删除`,
      );
    }
    await this.repo.remove(item);
  }

  private async countUsedTeachers(id: number): Promise<number> {
    const value = String(id);
    const normalize = `REPLACE(REPLACE(REPLACE(COALESCE(#field#, ''), '、', ','), '，', ','), ' ', '')`;
    const [{ cnt }] = await this.teacherRepo.query(
      `
        SELECT COUNT(*) AS cnt
        FROM teachers
        WHERE CONCAT(',', ${normalize.replace('#field#', 'specialty')}, ',') LIKE CONCAT('%,', ?, ',%')
           OR CONCAT(',', ${normalize.replace('#field#', 'direction')}, ',') LIKE CONCAT('%,', ?, ',%')
      `,
      [value, value],
    );
    return Number(cnt || 0);
  }
}
