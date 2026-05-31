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

interface PlazaFilters {
  view: 'all' | 'excellent' | 'favorites';
  platform?: string;
  postType?: string;
  employeeId?: string;
  userId?: string;
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

  async findPlaza(filters: PlazaFilters): Promise<any[]> {
    const params: any[] = [filters.userId || ''];
    const whereParts = ['1=1'];

    if (filters.platform) {
      whereParts.push('p.platform = ?');
      params.push(filters.platform);
    }
    if (filters.postType) {
      whereParts.push('p.post_type = ?');
      params.push(filters.postType);
    }
    if (filters.employeeId) {
      whereParts.push('p.employee_id = ?');
      params.push(filters.employeeId);
    }

    let favoriteJoin = '';
    if (filters.view === 'favorites') {
      favoriteJoin = `
        INNER JOIN favorites fav_join
          ON fav_join.target_type = 'post'
         AND fav_join.target_id = p.id COLLATE utf8mb4_unicode_ci
         AND fav_join.user_id = ?
      `;
      params.push(filters.userId || '');
    }

    const havingClause = filters.view === 'excellent' ? 'HAVING leads_count >= 5' : '';
    const sql = `
      SELECT
        p.id, p.employee_id, p.account_id, p.platform, p.title, p.copywriting,
        p.cover_image_url, p.post_url, p.post_type, p.traffic,
        p.likes, p.comments, p.favorites, p.shares,
        p.metrics_updated_at, p.published_at, p.note, p.supervisor_suggestion,
        p.created_at, p.updated_at,
        e.name AS employee_name,
        a.account_name,
        (SELECT COUNT(*) FROM leads l WHERE l.post_id = p.id) AS leads_count,
        (SELECT COUNT(*) FROM favorites fav_total
          WHERE fav_total.target_type = 'post'
            AND fav_total.target_id = p.id COLLATE utf8mb4_unicode_ci
        ) AS favorite_count,
        EXISTS(
          SELECT 1 FROM favorites fav
          WHERE fav.target_type = 'post'
            AND fav.target_id = p.id COLLATE utf8mb4_unicode_ci
            AND fav.user_id = ?
        ) AS is_favorited
      FROM posts p
      LEFT JOIN employees e ON e.id = p.employee_id
      LEFT JOIN accounts a ON a.id = p.account_id
      ${favoriteJoin}
      WHERE ${whereParts.join(' AND ')}
      ${havingClause}
      ORDER BY leads_count DESC, p.likes DESC, p.published_at DESC, p.created_at DESC
    `;

    const rows = await this.postRepository.query(sql, params);
    return (rows as any[]).map((row) => this.mapPostRow(row));
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

  private mapPostRow(row: any): any {
    return {
      id: row.id,
      employeeId: row.employee_id,
      employeeName: row.employee_name || '',
      accountId: row.account_id,
      accountName: row.account_name || '',
      platform: row.platform,
      title: row.title,
      copywriting: row.copywriting || '',
      coverImageUrl: row.cover_image_url,
      postUrl: row.post_url,
      postType: normalizePostType(row.post_type),
      traffic: normalizeTrafficByType(row.post_type, Number(row.traffic || 0)),
      likes: Number(row.likes || 0),
      comments: Number(row.comments || 0),
      favorites: Number(row.favorites || 0),
      shares: Number(row.shares || 0),
      metricsUpdatedAt: row.metrics_updated_at,
      publishedAt: row.published_at,
      note: row.note,
      supervisorSuggestion: row.supervisor_suggestion || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      leadsCount: Number(row.leads_count || 0),
      favoriteCount: Number(row.favorite_count || 0),
      isFavorited: Number(row.is_favorited || 0) === 1,
    };
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
