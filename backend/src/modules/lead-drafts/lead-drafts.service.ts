import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeadDraft } from '../../entities/lead-draft.entity';
import { makeId } from '../../shared/utils/id-generator';
import { encryptContentJson, decryptContentJson } from '../../shared/utils/crypto-field';

interface UpsertDraftDto {
  draftType: string;
  contentJson: string;
  imageUrls?: any;
}

const MAX_DRAFTS_PER_TYPE = 10;

@Injectable()
export class LeadDraftsService {
  constructor(
    @InjectRepository(LeadDraft)
    private readonly draftRepository: Repository<LeadDraft>,
  ) {}

  async findByUser(userId: string, draftType: string): Promise<any[]> {
    const rows = await this.draftRepository.find({
      where: { userId, draftType },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((row) => this.mapDraft(row, /* decrypt */ true));
  }

  // ---- §9 / AC-10.2 客资草稿列表分页 ----
  // 控制器有 limit/offset 时改走该方法，统一返回 { items, total, limit, offset }；
  // 老接口（findByUser）保留，前端无分页参数时直接返回数组以保持兼容。
  async findByUserPaged(
    userId: string,
    draftType: string,
    limit: number,
    offset: number,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const [rows, total] = await this.draftRepository.findAndCount({
      where: { userId, draftType },
      order: { updatedAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    return {
      items: rows.map((row) => this.mapDraft(row, /* decrypt */ true)),
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

  async upsert(id: string, userId: string, dto: UpsertDraftDto): Promise<any> {
    const draftType = dto.draftType;
    // C4-013 修复：写入前对 contentJson 中的敏感字段加密
    const contentJson = dto.contentJson
      ? encryptContentJson(dto.contentJson)
      : '';
    const imageUrls = dto.imageUrls === undefined ? null : dto.imageUrls;

    const existing = await this.draftRepository.findOne({ where: { id } });
    if (existing) {
      await this.draftRepository.update(id, {
        userId,
        draftType,
        contentJson,
        imageUrls,
      });
    } else {
      const draft = this.draftRepository.create({
        id: id || makeId(),
        userId,
        draftType,
        contentJson,
        imageUrls,
      });
      await this.draftRepository.save(draft);
    }

    // 保留策略：同 user_id + draft_type 最多 MAX_DRAFTS_PER_TYPE 条
    await this.pruneOldDrafts(userId, draftType);

    const saved = await this.draftRepository.findOne({ where: { id } });
    return saved ? this.mapDraft(saved, /* decrypt */ true) : null;
  }

  async remove(id: string): Promise<void> {
    await this.draftRepository.delete(id);
  }

  private async pruneOldDrafts(userId: string, draftType: string): Promise<void> {
    const rows = await this.draftRepository.find({
      where: { userId, draftType },
      order: { updatedAt: 'DESC' },
    });
    if (rows.length <= MAX_DRAFTS_PER_TYPE) return;
    const toDelete = rows.slice(MAX_DRAFTS_PER_TYPE).map((r) => r.id);
    if (toDelete.length === 0) return;
    await this.draftRepository.delete(toDelete);
  }

  private mapDraft(row: LeadDraft, decrypt: boolean = false): any {
    return {
      id: row.id,
      userId: row.userId,
      draftType: row.draftType,
      // C4-013 修复：读取时按需解密（明文标记存在时）
      contentJson: decrypt ? decryptContentJson(row.contentJson) : row.contentJson,
      imageUrls: row.imageUrls || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
