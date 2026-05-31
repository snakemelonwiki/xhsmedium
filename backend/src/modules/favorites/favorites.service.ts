import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from '../../entities/favorite.entity';
import { makeId } from '../../shared/utils/id-generator';

/**
 * 收藏域服务：作品/账号等对象的个人收藏 CRUD。
 * 数据落库到 favorites 表（唯一键 user_id + target_type + target_id），软删通过 deleted=1。
 */
@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
  ) {}

  /**
   * 添加收藏：upsert 风格。
   * - 已存在且 deleted=0：直接返回当前记录
   * - 存在但 deleted=1：把 deleted 改回 0（恢复收藏）
   * - 不存在：插入一条新记录
   * userId 为空时直接返回 false，不抛错。
   */
  async addFavorite(
    userId: string,
    targetType: string,
    targetId: string,
  ): Promise<boolean> {
    if (!userId || !targetType || !targetId) return false;

    // 命中唯一索引查现有记录（无视 deleted 状态）
    const existing = await this.favoriteRepo.findOne({
      where: { userId, targetType, targetId },
    });
    if (existing) {
      // 已是有效收藏：直接返回成功
      if (existing.deleted === 0) return true;
      // 软删记录恢复
      await this.favoriteRepo.update(existing.id, { deleted: 0 });
      return true;
    }

    // 新增收藏记录
    await this.favoriteRepo.save({
      id: makeId(),
      userId,
      targetType,
      targetId,
      deleted: 0,
    } as any);
    return true;
  }

  /**
   * 移除收藏：软删 deleted=1。
   * userId 为空或记录不存在时静默返回 false。
   */
  async removeFavorite(
    userId: string,
    targetType: string,
    targetId: string,
  ): Promise<boolean> {
    if (!userId || !targetType || !targetId) return false;
    const result = await this.favoriteRepo.update(
      { userId, targetType, targetId, deleted: 0 },
      { deleted: 1 },
    );
    return (result.affected || 0) > 0;
  }

  /**
   * 列出当前用户的有效收藏列表（按 createTime DESC）。
   * 控制器层负责按 targetType=post 时 join 作品详情。
   */
  async listFavoritesByUser(
    userId: string,
    targetType?: string,
  ): Promise<Favorite[]> {
    if (!userId) return [];
    const where: any = { userId, deleted: 0 };
    if (targetType) where.targetType = targetType;
    return this.favoriteRepo.find({
      where,
      order: { createTime: 'DESC' },
    });
  }

  /**
   * 判断是否已收藏。userId 为空时返回 false。
   */
  async isFavorited(
    userId: string,
    targetType: string,
    targetId: string,
  ): Promise<boolean> {
    if (!userId || !targetType || !targetId) return false;
    const count = await this.favoriteRepo.count({
      where: { userId, targetType, targetId, deleted: 0 },
    });
    return count > 0;
  }
}
