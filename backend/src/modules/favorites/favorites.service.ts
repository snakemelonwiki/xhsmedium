import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Favorite } from '../../entities/favorite.entity';
import { Post } from '../../entities/post.entity';
import { Account } from '../../entities/account.entity';
import { makeId } from '../../shared/utils/id-generator';

interface MineQuery {
  userId: string;
  targetType?: 'post' | 'account';
  limit: number;
  offset: number;
}

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly repo: Repository<Favorite>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async list(userId: string, targetType?: string): Promise<any[]> {
    if (!userId) return [];
    const where: any = { userId };
    if (targetType) where.targetType = targetType;
    const rows = await this.repo.find({ where });
    return rows.map((row) => this.map(row));
  }

  /**
   * v1.3 / OP-11 我的收藏：
   * 分页拉取当前用户的收藏列表，按收藏时间倒序。
   * 返回 items[i].target = 关联对象（post / account）的快照，前端直接渲染不用二次请求。
   * 关联对象不存在（如被删）时 target = null，前端可渲染为「已删除」占位。
   */
  async listMinePaged(query: MineQuery): Promise<{
    items: any[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const userId = query.userId;
    if (!userId) return { items: [], total: 0, limit: query.limit, offset: query.offset };
    const safeLimit = this.clampLimit(query.limit);
    const safeOffset = Math.max(Number(query.offset) || 0, 0);
    const where: any = { userId };
    if (query.targetType) where.targetType = query.targetType;
    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    const postIds = rows.filter((r) => r.targetType === 'post').map((r) => r.targetId);
    const accountIds = rows.filter((r) => r.targetType === 'account').map((r) => r.targetId);
    const [posts, accounts] = await Promise.all([
      postIds.length
        ? this.postRepository.find({ where: { id: In(postIds) } })
        : Promise.resolve([] as Post[]),
      accountIds.length
        ? this.accountRepository.find({ where: { id: In(accountIds) } })
        : Promise.resolve([] as Account[]),
    ]);
    const postMap = new Map(posts.map((p) => [p.id, p]));
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const items = rows.map((row) => {
      let target: any = null;
      if (row.targetType === 'post') {
        const p = postMap.get(row.targetId);
        if (p) {
          target = {
            id: p.id,
            title: p.title,
            platform: p.platform,
            postType: p.postType,
            coverImageUrl: p.coverImageUrl,
            coverThumbUrl: p.coverThumbUrl,
            postUrl: p.postUrl,
            accountId: p.accountId,
            likes: Number(p.likes || 0),
            comments: Number(p.comments || 0),
            favorites: Number(p.favorites || 0),
            publishedAt: p.publishedAt,
          };
        }
      } else if (row.targetType === 'account') {
        const a = accountMap.get(row.targetId);
        if (a) {
          target = {
            id: a.id,
            accountName: a.accountName,
            platform: a.platform,
            profileUrl: a.profileUrl,
            accountUid: a.accountUid,
            employeeId: a.employeeId,
          };
        }
      }
      return {
        id: row.id,
        userId: row.userId,
        targetType: row.targetType,
        targetId: row.targetId,
        target,
        createdAt: row.createdAt,
      };
    });

    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  private clampLimit(limit: number | undefined): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
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
