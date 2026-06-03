import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';
import { PostMetricsHistory } from '../../entities/post-metrics-history.entity';
import { makeId } from '../../shared/utils/id-generator';
import { normalizePostType, normalizeTrafficByType, normalizeExternalUrl, normalizeMediaUrl } from '../../shared/utils/normalize';

interface PostListFilters {
  employeeId?: string;
  accountId?: string;
  platform?: string;
  postType?: string;
  from?: string;
  to?: string;
  sort?: string;
  search?: string;
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
    return this.attachJoinNames(rows.map(this.mapPost));
  }

  async findByEmployee(employeeId: string): Promise<any[]> {
    const rows = await this.postRepository.find({
      where: { employeeId },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
    });
    return this.attachJoinNames(rows.map(this.mapPost));
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
    if (filters.search) {
      const kw = `%${filters.search}%`;
      qb.andWhere('(p.title LIKE :kw OR p.copywriting LIKE :kw)', { kw });
    }

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
    const items = await this.attachJoinNames(rows.map(this.mapPost));
    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  async findAllPagedLegacy(limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const [rows, total] = await this.postRepository.findAndCount({
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    const items = await this.attachJoinNames(rows.map(this.mapPost));
    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  /**
   * 根据作品链接识别平台并返回录入表单可直接回填的字段。
   */
  parsePostLink(postUrl: string): { platform: string; postUrl: string; title: string } {
    const normalizedUrl = normalizeExternalUrl(postUrl);
    const lowerUrl = normalizedUrl.toLowerCase();
    let platform = '其他';
    if (lowerUrl.includes('xiaohongshu.com') || lowerUrl.includes('xhslink.com')) {
      platform = '小红书';
    } else if (lowerUrl.includes('douyin.com') || lowerUrl.includes('iesdouyin.com')) {
      platform = '抖音';
    }
    return {
      platform,
      postUrl: normalizedUrl,
      title: `${platform}作品`,
    };
  }

  /**
   * 查找重复作品链接，更新时可排除当前作品。
   */
  async findDuplicateByUrl(postUrl: string, excludeId?: string): Promise<any | null> {
    const normalizedUrl = normalizeExternalUrl(postUrl);
    if (!normalizedUrl) return null;
    const qb = this.postRepository.createQueryBuilder('p')
      .where('p.post_url = :postUrl', { postUrl: normalizedUrl });
    if (excludeId) qb.andWhere('p.id != :excludeId', { excludeId });
    const row = await qb.getOne();
    return row ? this.mapPost(row) : null;
  }

  async findByEmployeePaged(employeeId: string, limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    return this.findPaged({ employeeId }, limit, offset);
  }

  async findPlaza(
    filters: PlazaFilters,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ items: any[]; total: number }> {
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

    const havingClause = filters.view === 'excellent' ? 'HAVING lc.cnt >= 5' : '';

    // Count query for total
    // 优化：使用预聚合子表替代相关子查询，消除 N+1 问题
    const countSql = `
      SELECT COUNT(DISTINCT p.id) AS total
      FROM posts p
      LEFT JOIN employees e ON e.id = p.employee_id
      LEFT JOIN accounts a ON a.id = p.account_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS cnt
        FROM leads
        WHERE post_id IS NOT NULL
        GROUP BY post_id
      ) lc ON lc.post_id = p.id
      ${favoriteJoin}
      WHERE ${whereParts.join(' AND ')}
      ${havingClause}
    `;
    const countParams = [...params];
    const countResult = await this.postRepository.query(countSql, countParams);
    const total = Number((countResult[0] as any)?.total || 0);

    // Data query with pagination
    const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 200);
    const safePage = Math.max(Number(page) || 1, 1);
    const offset = (safePage - 1) * safePageSize;

    const sql = `
      SELECT
        p.id, p.employee_id, p.account_id, p.platform, p.title, p.copywriting,
        p.cover_image_url, p.cover_thumb_url, p.post_url, p.post_type, p.traffic,
        p.likes, p.comments, p.favorites, p.shares,
        p.metrics_updated_at, p.published_at, p.note, p.supervisor_suggestion,
        p.created_at, p.updated_at,
        e.name AS employee_name,
        a.account_name,
        COALESCE(lc.cnt, 0) AS leads_count,
        COALESCE(fc.cnt, 0) AS favorite_count,
        CASE WHEN fav_user.target_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorited
      FROM posts p
      LEFT JOIN employees e ON e.id = p.employee_id
      LEFT JOIN accounts a ON a.id = p.account_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS cnt
        FROM leads
        WHERE post_id IS NOT NULL
        GROUP BY post_id
      ) lc ON lc.post_id = p.id
      LEFT JOIN (
        SELECT target_id, COUNT(*) AS cnt
        FROM favorites
        WHERE target_type = 'post'
        GROUP BY target_id
      ) fc ON fc.target_id = p.id
      LEFT JOIN (
        SELECT target_id
        FROM favorites
        WHERE target_type = 'post' AND user_id = ?
      ) fav_user ON fav_user.target_id = p.id
      ${favoriteJoin}
      WHERE ${whereParts.join(' AND ')}
      ${havingClause}
      ORDER BY COALESCE(lc.cnt, 0) DESC, p.likes DESC, p.published_at DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `;

    // dataParams: params 已经包含 userId（首元素）和过滤条件；末尾追加 pageSize 和 offset
    // 注意：不要再追加 filters.userId，否则会重复（之前导致 LIMIT 收到 userId 字符串而非数字）
    const dataParams = [...params, safePageSize, offset];
    const rows = await this.postRepository.query(sql, dataParams);
    return { items: (rows as any[]).map((row) => this.mapPostRow(row)), total };
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
      coverImageUrl: dto.coverImageUrl ? normalizeMediaUrl(dto.coverImageUrl) : null,
      coverThumbUrl: (dto as any).coverThumbUrl ? normalizeMediaUrl((dto as any).coverThumbUrl) : null,
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
    if (dto.coverImageUrl !== undefined) updates.coverImageUrl = dto.coverImageUrl ? normalizeMediaUrl(dto.coverImageUrl) : null;
    if ((dto as any).coverThumbUrl !== undefined) updates.coverThumbUrl = (dto as any).coverThumbUrl ? normalizeMediaUrl((dto as any).coverThumbUrl) : null;
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

  async updateMetrics(id: string, metrics: { likes: number; comments: number; favorites: number; shares?: number; metricsUpdatedAt: Date | null }): Promise<void> {
    await this.postRepository.update(id, {
      likes: metrics.likes,
      comments: metrics.comments,
      favorites: metrics.favorites,
      shares: Number(metrics.shares || 0),
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

  /**
   * 查询作品指标历史，按最新记录优先展示。
   */
  async getMetricsHistory(postId: string): Promise<any[]> {
    const rows = await this.metricsHistoryRepository.find({
      where: { postId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      postId: row.postId,
      likes: Number(row.likes || 0),
      comments: Number(row.comments || 0),
      favorites: Number(row.favorites || 0),
      shares: Number(row.shares || 0),
      leadsCount: Number(row.leadsCount || 0),
      createdAt: row.createdAt,
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
      coverThumbUrl: row.cover_thumb_url,
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
      coverThumbUrl: row.coverThumbUrl,
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

  /**
   * 把 employeeName / accountName 注入到 mapPost 输出上，
   * employeeId / accountId 保持不变，前端"员工"列优先显示姓名。
   * 单次批量查询，避免 N+1。
   */
  private async attachJoinNames(items: any[]): Promise<any[]> {
    if (!items.length) return items;

    const employeeIds = Array.from(new Set(items.map((i) => i.employeeId).filter(Boolean)));
    const accountIds = Array.from(new Set(items.map((i) => i.accountId).filter(Boolean)));

    const employeeNameMap = new Map<string, string>();
    if (employeeIds.length) {
      const placeholders = employeeIds.map(() => '?').join(',');
      const rows: Array<{ id: string; name: string | null; employee_code: string | null }> = await this.postRepository.manager.query(
        `SELECT id, name, employee_code FROM employees WHERE id IN (${placeholders})`,
        employeeIds,
      );
      for (const r of rows) {
        // 姓名缺失时回退到员工编号（备注用途），仍然缺失则交给前端兜底显示 ID
        employeeNameMap.set(r.id, (r.name || r.employee_code || '').trim());
      }
    }

    const accountNameMap = new Map<string, string>();
    if (accountIds.length) {
      const placeholders = accountIds.map(() => '?').join(',');
      const rows: Array<{ id: string; account_name: string | null }> = await this.postRepository.manager.query(
        `SELECT id, account_name FROM accounts WHERE id IN (${placeholders})`,
        accountIds,
      );
      for (const r of rows) {
        accountNameMap.set(r.id, (r.account_name || '').trim());
      }
    }

    return items.map((i) => ({
      ...i,
      employeeName: employeeNameMap.get(i.employeeId) || '',
      accountName: accountNameMap.get(i.accountId) || '',
    }));
  }
}
