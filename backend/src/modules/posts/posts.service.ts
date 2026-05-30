import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { makeId } from '../../shared/utils/id-generator';
import { normalizePostType, normalizeTrafficByType, normalizeExternalUrl } from '../../shared/utils/normalize';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
  ) {}

  async findAll(): Promise<any[]> {
    const rows = await this.postRepository.find({ order: { publishedAt: 'DESC', createdAt: 'DESC' } });
    return rows.map(this.mapPost);
  }

  async findByEmployee(employeeId: string): Promise<any[]> {
    const rows = await this.postRepository.find({
      where: { employeeId },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
    });
    return rows.map(this.mapPost);
  }

  async findAllPaged(limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const [rows, total] = await this.postRepository.findAndCount({
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items: rows.map(this.mapPost), total, limit, offset };
  }

  async findByEmployeePaged(employeeId: string, limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const [rows, total] = await this.postRepository.findAndCount({
      where: { employeeId },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items: rows.map(this.mapPost), total, limit, offset };
  }

  async findById(id: string): Promise<any | null> {
    const row = await this.postRepository.findOne({ where: { id } });
    return row ? this.mapPost(row) : null;
  }

  async create(dto: Partial<Post>): Promise<void> {
    const post = this.postRepository.create({
      ...dto,
      id: makeId(),
      postType: normalizePostType(dto.postType),
      traffic: normalizeTrafficByType(dto.postType, dto.traffic),
      coverImageUrl: dto.coverImageUrl ? normalizeExternalUrl(dto.coverImageUrl) : null,
      postUrl: dto.postUrl ? normalizeExternalUrl(dto.postUrl) : null,
      copywriting: dto.copywriting || '',
      supervisorSuggestion: dto.supervisorSuggestion || '',
    } as any);
    await this.postRepository.save(post);
  }

  async update(id: string, dto: Partial<Post>): Promise<void> {
    const updates: any = {};
    if (dto.accountId !== undefined) updates.accountId = dto.accountId;
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.copywriting !== undefined) updates.copywriting = dto.copywriting || '';
    if (dto.coverImageUrl !== undefined) updates.coverImageUrl = dto.coverImageUrl ? normalizeExternalUrl(dto.coverImageUrl) : null;
    if (dto.postUrl !== undefined) updates.postUrl = dto.postUrl ? normalizeExternalUrl(dto.postUrl) : null;
    if (dto.postType !== undefined) {
      updates.postType = normalizePostType(dto.postType);
      if (dto.traffic !== undefined) {
        updates.traffic = normalizeTrafficByType(dto.postType, dto.traffic);
      }
    }
    if (dto.traffic !== undefined && dto.postType === undefined) {
      const existing = await this.postRepository.findOne({ where: { id } });
      updates.traffic = existing ? normalizeTrafficByType(existing.postType, dto.traffic) : Number(dto.traffic || 0);
    }
    if (dto.likes !== undefined) updates.likes = dto.likes;
    if (dto.comments !== undefined) updates.comments = dto.comments;
    if (dto.favorites !== undefined) updates.favorites = dto.favorites;
    if (dto.metricsUpdatedAt !== undefined) updates.metricsUpdatedAt = dto.metricsUpdatedAt;
    if (dto.publishedAt !== undefined) updates.publishedAt = dto.publishedAt;
    if (dto.note !== undefined) updates.note = dto.note;
    if (dto.supervisorSuggestion !== undefined) updates.supervisorSuggestion = dto.supervisorSuggestion || '';
    await this.postRepository.update(id, updates);
  }

  async updateSupervisorSuggestion(id: string, suggestion: string): Promise<void> {
    await this.postRepository.update(id, { supervisorSuggestion: suggestion || '' });
  }

  async updateMetrics(id: string, metrics: { likes: number; comments: number; favorites: number; metricsUpdatedAt: Date | null }): Promise<void> {
    await this.postRepository.update(id, {
      likes: metrics.likes,
      comments: metrics.comments,
      favorites: metrics.favorites,
      metricsUpdatedAt: metrics.metricsUpdatedAt,
    });
  }

  async remove(id: string): Promise<void> {
    await this.postRepository.delete(id);
  }

  private mapPost(row: Post): any {
    return {
      id: row.id,
      employeeId: row.employeeId,
      accountId: row.accountId,
      platform: row.platform,
      title: row.title,
      copywriting: row.copywriting || '',
      coverImageUrl: row.coverImageUrl,
      postUrl: row.postUrl,
      postType: normalizePostType(row.postType),
      traffic: normalizeTrafficByType(row.postType, row.traffic),
      likes: row.likes,
      comments: row.comments,
      favorites: row.favorites,
      metricsUpdatedAt: row.metricsUpdatedAt,
      publishedAt: row.publishedAt,
      note: row.note,
      supervisorSuggestion: row.supervisorSuggestion || '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
