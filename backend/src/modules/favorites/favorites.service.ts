import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Favorite } from '../../entities/favorite.entity';
import { makeId } from '../../shared/utils/id-generator';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly repo: Repository<Favorite>,
  ) {}

  async list(userId: string, targetType?: string): Promise<any[]> {
    if (!userId) return [];
    const where: any = { userId };
    if (targetType) where.targetType = targetType;
    const rows = await this.repo.find({ where });
    return rows.map((row) => this.map(row));
  }

  async ids(userId: string, targetType: string): Promise<string[]> {
    const rows = await this.list(userId, targetType);
    return rows.map((row) => row.targetId);
  }

  async counts(targetType: string, targetIds: string[]): Promise<Record<string, number>> {
    const ids = Array.from(new Set((targetIds || []).filter(Boolean)));
    if (!targetType || ids.length === 0) return {};
    const rows = await this.repo.createQueryBuilder('f')
      .select('f.target_id', 'targetId')
      .addSelect('COUNT(1)', 'count')
      .where('f.target_type = :targetType', { targetType })
      .andWhere('f.target_id IN (:...ids)', { ids })
      .groupBy('f.target_id')
      .getRawMany();
    return rows.reduce((acc, row) => {
      acc[row.targetId] = Number(row.count || 0);
      return acc;
    }, {} as Record<string, number>);
  }

  async toggle(userId: string, targetType: string, targetId: string): Promise<any> {
    if (!userId || !targetType || !targetId) {
      return { ok: false, favorited: false };
    }
    const existing = await this.repo.findOne({ where: { userId, targetType, targetId } });
    if (existing) {
      await this.repo.delete(existing.id);
      return { ok: true, favorited: false };
    }
    await this.repo.save(this.repo.create({
      id: makeId(),
      userId,
      targetType,
      targetId,
    }));
    return { ok: true, favorited: true };
  }

  async removeMissing(userId: string, targetType: string, keepIds: string[]): Promise<void> {
    const ids = (keepIds || []).filter(Boolean);
    if (!userId || !targetType) return;
    const qb = this.repo.createQueryBuilder()
      .delete()
      .from(Favorite)
      .where('user_id = :userId AND target_type = :targetType', { userId, targetType });
    if (ids.length) qb.andWhere('target_id NOT IN (:...ids)', { ids });
    await qb.execute();
  }

  async sync(userId: string, targetType: string, targetIds: string[]): Promise<string[]> {
    const ids = Array.from(new Set((targetIds || []).filter(Boolean)));
    if (!userId || !targetType) return [];
    await this.removeMissing(userId, targetType, ids);
    if (!ids.length) return [];
    const existing = await this.repo.find({ where: { userId, targetType, targetId: In(ids) } });
    const existingIds = new Set(existing.map((row) => row.targetId));
    const rows = ids
      .filter((targetId) => !existingIds.has(targetId))
      .map((targetId) => this.repo.create({ id: makeId(), userId, targetType, targetId }));
    if (rows.length) await this.repo.save(rows);
    return ids;
  }

  private map(row: Favorite): any {
    return {
      id: row.id,
      userId: row.userId,
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: row.createdAt,
    };
  }
}
