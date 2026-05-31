import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';
import { PostMetricsHistory } from '../../entities/post-metrics-history.entity';
import { makeId } from '../../shared/utils/id-generator';
import { normalizePostType, normalizeTrafficByType, normalizeExternalUrl } from '../../shared/utils/normalize';

interface PostListFilters {
  employeeId?: string;
  accountId?: string;
  platform?: string;
  postType?: string;
  from?: string;
  to?: string;
  sort?: string;
}

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(PostMetricsHistory)
    private readonly metricsHistoryRepository: Repository<PostMetricsHistory>,
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
    return this.findPaged({}, limit, offset);
  }

  async findPaged(filters: PostListFilters, limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const qb = this.postRepository.createQueryBuilder('p');

    if (filters.employeeId) qb.andWhere('p.employee_id = :employeeId', { employeeId: filters.employeeId });
    if (filters.accountId) qb.andWhere('p.account_id = :accountId', { accountId: filters.accountId });
    if (filters.platform) qb.andWhere('p.platform = :platform', { platform: filters.platform });
    if (filters.postType) qb.andWhere('p.post_type = :postType', { postType: filters.postType });
    if (filters.from) qb.andWhere('p.published_at >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('p.published_at <= :to', { to: filters.to });

    if (filters.sort === 'leads') {
      qb.addSelect((subQb) => {
        return subQb
          .select('COUNT(1)')
          .from('leads', 'l')
          .where('l.post_id = p.id');
      }, 'lead_count')
        .orderBy('lead_count', 'DESC')
        .addOrderBy('p.published_at', 'DESC')
        .addOrderBy('p.created_at', 'DESC');
    } else {
      qb.orderBy('p.published_at', 'DESC').addOrderBy('p.created_at', 'DESC');
    }

    const [rows, total] = await qb.take(safeLimit).skip(safeOffset).getManyAndCount();
    return { items: rows.map(this.mapPost), total, limit: safeLimit, offset: safeOffset };
  }

  async findAllPagedLegacy(limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const [rows, total] = await this.postRepository.findAndCount({
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    return { items: rows.map(this.mapPost), total, limit: safeLimit, offset: safeOffset };
  }

  async findByEmployeePaged(employeeId: string, limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    return this.findPaged({ employeeId }, limit, offset);
  }

  private clampLimit(limit: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  async findById(id: string): Promise<any | null> {
    const row = await this.postRepository.findOne({ where: { id } });
    return row ? this.mapPost(row) : null;
  }

  async findByIds(ids: string[]): Promise<any[]> {
    const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!cleanIds.length) return [];
    const rows = await this.postRepository.createQueryBuilder('p')
      .where('p.id IN (:...ids)', { ids: cleanIds })
      .orderBy('p.published_at', 'DESC')
      .addOrderBy('p.created_at', 'DESC')
      .getMany();
    return rows.map(this.mapPost);
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

  async recordMetricsHistory(id: string, metrics: { likes: number; comments: number; favorites: number; shares?: number }): Promise<void> {
    const leadsCount = await this.leadRepository.count({ where: { postId: id } });
    await this.metricsHistoryRepository.save(this.metricsHistoryRepository.create({
      id: makeId(),
      postId: id,
      likes: Number(metrics.likes || 0),
      comments: Number(metrics.comments || 0),
      favorites: Number(metrics.favorites || 0),
      shares: Number(metrics.shares || 0),
      leadsCount,
    }));
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
