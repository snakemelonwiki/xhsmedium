import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { PostMetricsHistory } from '../../entities/post-metrics-history.entity';
import { makeId } from '../../shared/utils/id-generator';
import { normalizePostType, normalizeTrafficByType, normalizeExternalUrl } from '../../shared/utils/normalize';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(PostMetricsHistory)
    private readonly historyRepo: Repository<PostMetricsHistory>,
  ) {}

  async findAll(): Promise<any[]> {
    const rows = await this.postRepository.find({ order: { publishedAt: 'DESC', createdAt: 'DESC' } });
    return rows.map(this.mapPost);
  }

  /**
   * 分页查询全部作品，返回总数与当前页数据。
   */
  async findAllPage(pagination: { limit: number; offset: number }): Promise<{ total: number; items: any[] }> {
    const [rows, total] = await this.postRepository.findAndCount({
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      take: pagination.limit,
      skip: pagination.offset,
    });
    return { total, items: rows.map(this.mapPost) };
  }

  async findByEmployee(employeeId: string): Promise<any[]> {
    const rows = await this.postRepository.find({
      where: { employeeId },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
    });
    return rows.map(this.mapPost);
  }

  /**
   * 分页查询指定员工作品，返回总数与当前页数据。
   */
  async findByEmployeePage(employeeId: string, pagination: { limit: number; offset: number }): Promise<{ total: number; items: any[] }> {
    const [rows, total] = await this.postRepository.findAndCount({
      where: { employeeId },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      take: pagination.limit,
      skip: pagination.offset,
    });
    return { total, items: rows.map(this.mapPost) };
  }

  /**
   * 作品看板列表（全量）：在 findAll 基础上附加 leadsCount、isFavorited。
   * 字段映射风格与 findPlaza 保持一致；userId 为空时 isFavorited 全部为 false。
   */
  async findAllWithFavorite(userId: string = ''): Promise<any[]> {
    return this.queryPostsWithFavorite(userId, undefined);
  }

  /**
   * 分页查询全部作品，并附加收藏与获客统计。
   */
  async findAllWithFavoritePage(userId: string = '', pagination: { limit: number; offset: number }): Promise<{ total: number; items: any[] }> {
    return this.queryPostsWithFavoritePage(userId, pagination, undefined);
  }

  /**
   * 作品看板列表（按员工）：在 findByEmployee 基础上附加 leadsCount、isFavorited。
   */
  async findByEmployeeWithFavorite(employeeId: string, userId: string = ''): Promise<any[]> {
    return this.queryPostsWithFavorite(userId, employeeId);
  }

  /**
   * 分页查询员工作品，并附加收藏与获客统计。
   */
  async findByEmployeeWithFavoritePage(employeeId: string, userId: string = '', pagination: { limit: number; offset: number }): Promise<{ total: number; items: any[] }> {
    return this.queryPostsWithFavoritePage(userId, pagination, employeeId);
  }

  /**
   * 内部封装：用裸 SQL 拉取作品 + EXISTS 子查询出 is_favorited。
   * employeeId 非空时附加过滤；与 findPlaza 字段口径保持一致。
   */
  private async queryPostsWithFavorite(userId: string, employeeId?: string): Promise<any[]> {
    const params: any[] = [userId || ''];
    let employeeWhere = '';
    if (employeeId) {
      employeeWhere = ' AND p.employee_id = ?';
      params.push(employeeId);
    }

    const sql = `
      SELECT
        p.id, p.employee_id, p.account_id, p.platform, p.title, p.copywriting,
        p.cover_image_url, p.post_url, p.post_type, p.traffic,
        p.likes, p.comments, p.favorites, p.shares,
        p.metrics_updated_at, p.published_at, p.note, p.supervisor_suggestion,
        p.created_at, p.updated_at,
        (SELECT COUNT(*) FROM leads l WHERE l.post_id = p.id) AS leads_count,
        (SELECT COUNT(*) FROM favorites fav_total
          WHERE fav_total.target_type = 'post' AND fav_total.target_id = p.id COLLATE utf8mb4_unicode_ci
            AND fav_total.deleted = 0
        ) AS favorite_count,
        EXISTS(
          SELECT 1 FROM favorites fav
          WHERE fav.target_type = 'post' AND fav.target_id = p.id COLLATE utf8mb4_unicode_ci
            AND fav.user_id = ? AND fav.deleted = 0
        ) AS is_favorited
      FROM posts p
      WHERE 1=1${employeeWhere}
      ORDER BY p.published_at DESC, p.created_at DESC
    `;

    const rows = await this.postRepository.query(sql, params);
    return (rows as any[]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      accountId: r.account_id,
      platform: r.platform,
      title: r.title,
      copywriting: r.copywriting || '',
      coverImageUrl: r.cover_image_url,
      postUrl: r.post_url,
      postType: normalizePostType(r.post_type),
      traffic: normalizeTrafficByType(r.post_type, Number(r.traffic || 0)),
      likes: Number(r.likes || 0),
      comments: Number(r.comments || 0),
      favorites: Number(r.favorites || 0),
      shares: Number(r.shares || 0),
      metricsUpdatedAt: r.metrics_updated_at,
      publishedAt: r.published_at,
      note: r.note,
      supervisorSuggestion: r.supervisor_suggestion || '',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      leadsCount: Number(r.leads_count || 0),
      favoriteCount: Number(r.favorite_count || 0),
      isFavorited: Number(r.is_favorited || 0) === 1,
    }));
  }

  /**
   * 内部封装：分页拉取作品 + EXISTS 子查询出 is_favorited。
   */
  private async queryPostsWithFavoritePage(userId: string, pagination: { limit: number; offset: number }, employeeId?: string): Promise<{ total: number; items: any[] }> {
    const params: any[] = [userId || ''];
    const countParams: any[] = [];
    let employeeWhere = '';
    if (employeeId) {
      employeeWhere = ' AND p.employee_id = ?';
      params.push(employeeId);
      countParams.push(employeeId);
    }

    const sql = `
      SELECT
        p.id, p.employee_id, p.account_id, p.platform, p.title, p.copywriting,
        p.cover_image_url, p.post_url, p.post_type, p.traffic,
        p.likes, p.comments, p.favorites, p.shares,
        p.metrics_updated_at, p.published_at, p.note, p.supervisor_suggestion,
        p.created_at, p.updated_at,
        (SELECT COUNT(*) FROM leads l WHERE l.post_id = p.id) AS leads_count,
        (SELECT COUNT(*) FROM favorites fav_total
          WHERE fav_total.target_type = 'post' AND fav_total.target_id = p.id COLLATE utf8mb4_unicode_ci
            AND fav_total.deleted = 0
        ) AS favorite_count,
        EXISTS(
          SELECT 1 FROM favorites fav
          WHERE fav.target_type = 'post' AND fav.target_id = p.id COLLATE utf8mb4_unicode_ci
            AND fav.user_id = ? AND fav.deleted = 0
        ) AS is_favorited
      FROM posts p
      WHERE 1=1${employeeWhere}
      ORDER BY p.published_at DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(pagination.limit, pagination.offset);

    const [rows, countRows] = await Promise.all([
      this.postRepository.query(sql, params),
      this.postRepository.query(`SELECT COUNT(*) AS total FROM posts p WHERE 1=1${employeeWhere}`, countParams),
    ]);
    const items = (rows as any[]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      accountId: r.account_id,
      platform: r.platform,
      title: r.title,
      copywriting: r.copywriting || '',
      coverImageUrl: r.cover_image_url,
      postUrl: r.post_url,
      postType: normalizePostType(r.post_type),
      traffic: normalizeTrafficByType(r.post_type, Number(r.traffic || 0)),
      likes: Number(r.likes || 0),
      comments: Number(r.comments || 0),
      favorites: Number(r.favorites || 0),
      shares: Number(r.shares || 0),
      metricsUpdatedAt: r.metrics_updated_at,
      publishedAt: r.published_at,
      note: r.note,
      supervisorSuggestion: r.supervisor_suggestion || '',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      leadsCount: Number(r.leads_count || 0),
      favoriteCount: Number(r.favorite_count || 0),
      isFavorited: Number(r.is_favorited || 0) === 1,
    }));
    return { total: Number((countRows as any[])?.[0]?.total || 0), items };
  }

  async findById(id: string): Promise<any | null> {
    const row = await this.postRepository.findOne({ where: { id } });
    return row ? this.mapPost(row) : null;
  }

  /**
   * 作品广场查询：员工端强制走 excellent（leads_count >= 5），主管端按 view 切换。
   * - view=all       全量
   * - view=excellent leads_count >= 5
   * - view=favorites 当前用户已收藏的作品（target_type='post'）
   * 返回字段在常规 post 字段基础上附加 leadsCount、isFavorited。
   */
  async findPlaza(opts: {
    view: 'all' | 'excellent' | 'favorites';
    platform?: string;
    postType?: string;
    employeeId?: string;
    userId?: string;
  }): Promise<any[]> {
    const params: any[] = [];
    // isFavorited 子查询的 user_id 参数（无用户时为空字符串，匹配不到）
    params.push(opts.userId || '');

    const whereParts: string[] = ['1=1'];
    if (opts.platform) { whereParts.push('p.platform = ?'); params.push(opts.platform); }
    if (opts.postType) { whereParts.push('p.post_type = ?'); params.push(opts.postType); }
    if (opts.employeeId) { whereParts.push('p.employee_id = ?'); params.push(opts.employeeId); }

    let joinFavorites = '';
    if (opts.view === 'favorites') {
      // 仅返回当前用户已收藏的作品；userId 为空时返回空集
      joinFavorites = " INNER JOIN favorites fav_join ON fav_join.target_type = 'post' AND fav_join.target_id = p.id COLLATE utf8mb4_unicode_ci AND fav_join.user_id = ? AND fav_join.deleted = 0";
      params.push(opts.userId || '');
    }

    // leads_count 用子查询，方便 HAVING 过滤；MySQL 允许 HAVING 引用 SELECT 别名
    const havingClause = opts.view === 'excellent' ? ' HAVING leads_count >= 5' : '';

    const sql = `
      SELECT
        p.id, p.employee_id, p.account_id, p.platform, p.title, p.copywriting,
        p.cover_image_url, p.post_url, p.post_type, p.traffic,
        p.likes, p.comments, p.favorites, p.shares,
        p.metrics_updated_at, p.published_at, p.note, p.supervisor_suggestion,
        p.created_at, p.updated_at,
        (SELECT COUNT(*) FROM leads l WHERE l.post_id = p.id) AS leads_count,
        (SELECT COUNT(*) FROM favorites fav_total
          WHERE fav_total.target_type = 'post' AND fav_total.target_id = p.id COLLATE utf8mb4_unicode_ci
            AND fav_total.deleted = 0
        ) AS favorite_count,
        EXISTS(
          SELECT 1 FROM favorites fav
          WHERE fav.target_type = 'post' AND fav.target_id = p.id COLLATE utf8mb4_unicode_ci
            AND fav.user_id = ? AND fav.deleted = 0
        ) AS is_favorited
      FROM posts p${joinFavorites}
      WHERE ${whereParts.join(' AND ')}${havingClause}
      ORDER BY p.published_at DESC, p.created_at DESC
    `;

    const rows = await this.postRepository.query(sql, params);
    return (rows as any[]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      accountId: r.account_id,
      platform: r.platform,
      title: r.title,
      copywriting: r.copywriting || '',
      coverImageUrl: r.cover_image_url,
      postUrl: r.post_url,
      postType: normalizePostType(r.post_type),
      traffic: normalizeTrafficByType(r.post_type, Number(r.traffic || 0)),
      likes: Number(r.likes || 0),
      comments: Number(r.comments || 0),
      favorites: Number(r.favorites || 0),
      shares: Number(r.shares || 0),
      metricsUpdatedAt: r.metrics_updated_at,
      publishedAt: r.published_at,
      note: r.note,
      supervisorSuggestion: r.supervisor_suggestion || '',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      leadsCount: Number(r.leads_count || 0),
      favoriteCount: Number(r.favorite_count || 0),
      isFavorited: Number(r.is_favorited || 0) === 1,
    }));
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
    if (dto.shares !== undefined) updates.shares = Number(dto.shares || 0);
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
    const updates: any = {
      likes: metrics.likes,
      comments: metrics.comments,
      favorites: metrics.favorites,
      metricsUpdatedAt: metrics.metricsUpdatedAt,
    };
    if (metrics.shares !== undefined && metrics.shares !== null) {
      updates.shares = Number(metrics.shares || 0);
    }
    await this.postRepository.update(id, updates);
  }

  /**
   * 写入一条 post_metrics_history 抓取记录。
   * leadsCount 通过实时 SQL 计数获取，避免依赖 leads 域服务。
   */
  async saveMetricsHistory(
    postId: string,
    metrics: { likes?: number; comments?: number; favorites?: number; shares?: number },
  ): Promise<void> {
    // 统计当前作品的获客数（用于历史快照对比）
    const countRows = await this.postRepository.query(
      'SELECT COUNT(*) AS cnt FROM leads WHERE post_id = ?',
      [postId],
    );
    const leadsCount = Number((countRows && countRows[0] && countRows[0].cnt) || 0);

    // 落库一行抓取快照
    await this.historyRepo.save({
      id: makeId(),
      postId,
      likes: Number(metrics.likes || 0),
      comments: Number(metrics.comments || 0),
      favorites: Number(metrics.favorites || 0),
      shares: Number(metrics.shares || 0),
      leadsCount,
      capturedAt: new Date(),
    } as any);
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
      shares: Number(row.shares || 0),
      metricsUpdatedAt: row.metricsUpdatedAt,
      publishedAt: row.publishedAt,
      note: row.note,
      supervisorSuggestion: row.supervisorSuggestion || '',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

