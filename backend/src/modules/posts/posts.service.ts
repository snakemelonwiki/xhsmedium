import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';
import { PostMetricsHistory } from '../../entities/post-metrics-history.entity';
import { PostMetrics } from '../../entities/post-metrics.entity';
import { makeId } from '../../shared/utils/id-generator';
import { normalizePostType, normalizeTrafficByType, normalizeExternalUrl, normalizeMediaUrl } from '../../shared/utils/normalize';
import { PostsMetricsService } from './posts-metrics.service';
import { FavoritesService } from '../favorites/favorites.service';

interface PostListFilters {
  employeeId?: string;
  accountId?: string;
  platform?: string;
  postType?: string;
  from?: string;
  to?: string;
  sort?: string;
  search?: string;
  url?: string;
  postUrl?: string;
}

interface PlazaFilters {
  view: 'all' | 'excellent' | 'favorites';
  platform?: string;
  postType?: string;
  employeeId?: string;
  userId?: string;
}

/**
 * v1.3 OP-14: 作品广场对全员开放，但 leadsCount 涉及客户隐私，仅向
 *   - 作品作者本人
 *   - supervisor / admin / owner
 * 暴露真实值；其他访问者（含普通 staff / sales）看到 0，schema 保持一致。
 */
interface PostViewer {
  employeeId?: string;
  role?: string;
}

/**
 * viewer 上下文：用于按当前登录用户计算 isFavorited 等个人化字段。
 * 透传自 controller，使用 getSessionUserId / getSessionRole 提取。
 */
export interface PostsListViewer {
  viewerUserId?: string;
  viewerRole?: string;
  viewerEmployeeId?: string;
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
    @InjectRepository(PostMetrics)
    private readonly postMetricsRepository: Repository<PostMetrics>,
    @Optional()
    private readonly postsMetricsService?: PostsMetricsService,
    @Optional()
    private readonly favoritesService?: FavoritesService,
  ) {}

  async findAll(viewer?: PostsListViewer): Promise<any[]> {
    const rows = await this.postRepository.find({ order: { publishedAt: 'DESC', createdAt: 'DESC' } });
    const items = await this.attachJoinNames(rows.map((r) => this.mapPost(r)));
    return this.decorateWithFavorites(items, viewer);
  }

  async findByEmployee(employeeId: string, viewer?: PostsListViewer): Promise<any[]> {
    const rows = await this.postRepository.find({
      where: { employeeId },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
    });
    const items = await this.attachJoinNames(rows.map((r) => this.mapPost(r)));
    return this.decorateWithFavorites(items, viewer);
  }

  async findAllPaged(limit: number, offset: number, viewer?: PostsListViewer): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    return this.findPaged({}, limit, offset, viewer);
  }

  async findPaged(filters: PostListFilters, limit: number, offset: number, viewer?: PostsListViewer): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
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
    // 修复 (2026-06-05)：运营端作品录入提交前的重复检查依赖此过滤；
    //   url/postUrl 与 create 时的 normalizeExternalUrl 逻辑保持一致，避免同一 URL 在两侧被识别成不同字符串。
    const urlFilter = filters.url || filters.postUrl;
    if (urlFilter) {
      const normalized = normalizeExternalUrl(urlFilter);
      if (normalized) qb.andWhere('p.post_url = :postUrl', { postUrl: normalized });
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
    } else if (filters.sort === 'traffic') {
      qb.orderBy('p.traffic', 'DESC')
        .addOrderBy('p.published_at', 'DESC')
        .addOrderBy('p.created_at', 'DESC');
    } else {
      qb.orderBy('p.published_at', 'DESC').addOrderBy('p.created_at', 'DESC');
    }

    const [rows, total] = await qb.take(safeLimit).skip(safeOffset).getManyAndCount();
    const items = await this.attachJoinNames(rows.map((r) => this.mapPost(r)));
    await this.decorateWithFavorites(items, viewer);
    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  async findAllPagedLegacy(limit: number, offset: number, viewer?: PostsListViewer): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const [rows, total] = await this.postRepository.findAndCount({
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    const items = await this.attachJoinNames(rows.map((r) => this.mapPost(r)));
    await this.decorateWithFavorites(items, viewer);
    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  /**
   * 根据作品链接识别平台，返回录入表单可直接回填的字段。
   * 沿用 legacy `metricsFetcher.js` 的 Playwright 抓取能力（在注入 metricsService 时启用）：
   * - 成功抓取：返回完整标题与四项指标（likes/comments/favorites/shares）
   * - 抓取失败（登录墙/网络/超时）：返回基础识别 + parsed:false，不抛错
   * - 未识别平台：直接返回 platform='其他'，parsed:false
   */
  async parsePostLink(
    postUrl: string,
    options: { fetch?: boolean } = {},
  ): Promise<{
    platform: string;
    postUrl: string;
    title: string;
    authorName?: string;
    authorId?: string;
    likes: number;
    comments: number;
    favorites: number;
    shares: number;
    /** 抓取截图：原图 / 缩略图（同源低分辨率图）。抓取失败时为空串。 */
    coverImageUrl: string;
    coverThumbUrl: string;
    parsed: boolean;
    warning?: string;
  }> {
    const normalizedUrl = normalizeExternalUrl(postUrl);
    const lowerUrl = normalizedUrl.toLowerCase();
    let platform = '其他';
    if (lowerUrl.includes('xiaohongshu.com') || lowerUrl.includes('xhslink.com')) {
      platform = '小红书';
    } else if (lowerUrl.includes('douyin.com') || lowerUrl.includes('iesdouyin.com')) {
      platform = '抖音';
    }

    const fallback = {
      platform,
      postUrl: normalizedUrl,
      title: `${platform === '其他' ? '待补充' : platform}作品`,
      likes: 0,
      comments: 0,
      favorites: 0,
      shares: 0,
      coverImageUrl: '',
      coverThumbUrl: '',
      parsed: false as boolean,
    };

    if (!normalizedUrl || platform === '其他') {
      return fallback;
    }

    // 默认开启抓取；调用方可通过 options.fetch=false 显式关闭
    const shouldFetch = options.fetch !== false;
    if (!shouldFetch || !this.postsMetricsService) {
      return fallback;
    }

    try {
      // 优化：parsePostLink 走 'parse-link' source → metricsService 单次 20s 不重试，
      //   避免 3 次重试 45s+ 撞 nginx 60s 上限。
      const scraped = await this.postsMetricsService.fetchMetricsFromUrl(normalizedUrl, {
        source: 'parse-link',
      });
      return {
        platform: scraped.platform || platform,
        postUrl: normalizedUrl,
        title: String(scraped.title || fallback.title),
        authorName: scraped.authorName || undefined,
        authorId: scraped.authorId || undefined,
        likes: Number(scraped.likes || 0),
        comments: Number(scraped.comments || 0),
        favorites: Number(scraped.favorites || 0),
        shares: Number(scraped.shares || 0),
        coverImageUrl: scraped.coverImageUrl || '',
        coverThumbUrl: scraped.coverThumbUrl || '',
        parsed: true,
      };
    } catch (err: any) {
      // 抓取失败时降级返回基础识别 + 警告，前端不抛错
      return {
        ...fallback,
        warning: err?.message || '链接抓取失败',
      };
    }
  }

  /**
   * 查找重复作品链接，更新时可排除当前作品。
   */
  async findDuplicateByUrl(postUrl: string, excludeId?: string, viewer?: PostsListViewer): Promise<any | null> {
    const normalizedUrl = normalizeExternalUrl(postUrl);
    if (!normalizedUrl) return null;
    const qb = this.postRepository.createQueryBuilder('p')
      .where('p.post_url = :postUrl', { postUrl: normalizedUrl });
    if (excludeId) qb.andWhere('p.id != :excludeId', { excludeId });
    const row = await qb.getOne();
    if (!row) return null;
    const items = await this.attachJoinNames([this.mapPost(row)]);
    await this.decorateWithFavorites(items, viewer);
    return items[0];
  }

  async findByEmployeePaged(employeeId: string, limit: number, offset: number, viewer?: PostsListViewer): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    return this.findPaged({ employeeId }, limit, offset, viewer);
  }

  async findPlaza(
    filters: PlazaFilters,
    page: number = 1,
    pageSize: number = 20,
    viewer?: PostViewer,
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
      ) lc ON lc.post_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
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
      LEFT JOIN employees e ON e.id COLLATE utf8mb4_unicode_ci = p.employee_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN accounts a ON a.id COLLATE utf8mb4_unicode_ci = p.account_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS cnt
        FROM leads
        WHERE post_id IS NOT NULL
        GROUP BY post_id
      ) lc ON lc.post_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
        SELECT target_id, COUNT(*) AS cnt
        FROM favorites
        WHERE target_type = 'post'
        GROUP BY target_id
      ) fc ON fc.target_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
        SELECT target_id
        FROM favorites
        WHERE target_type = 'post' AND user_id = ?
      ) fav_user ON fav_user.target_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
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
    return { items: (rows as any[]).map((row) => this.mapPostRow(row, viewer)), total };
  }

  private clampLimit(limit: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  async findById(id: string, viewer?: PostsListViewer): Promise<any | null> {
    const row = await this.postRepository.findOne({ where: { id } });
    if (!row) return null;
    const items = await this.attachJoinNames([this.mapPost(row)]);
    await this.decorateWithFavorites(items, viewer);
    return items[0];
  }

  async findByIds(ids: string[], viewer?: PostsListViewer): Promise<any[]> {
    const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!cleanIds.length) return [];
    const rows = await this.postRepository.createQueryBuilder('p')
      .where('p.id IN (:...ids)', { ids: cleanIds })
      .orderBy('p.published_at', 'DESC')
      .addOrderBy('p.created_at', 'DESC')
      .getMany();
    const items = await this.attachJoinNames(rows.map((r) => this.mapPost(r)));
    await this.decorateWithFavorites(items, viewer);
    return items;
  }

  async create(dto: Partial<Post>): Promise<void> {
    const post = this.postRepository.create({
      ...dto,
      id: makeId(),
      // 修复 (2026-06-05)：posts.account_id 是 NOT NULL 但前端表单把它列为可选项。
      //   TypeORM 收到 undefined 时会让 MySQL 用 DEFAULT 兜底，而该列没设默认 → ER_NO_DEFAULT_FOR_FIELD 500。
      //   统一把空值归一为 ''，与 copywriting / supervisorSuggestion 的处理保持一致。
      accountId: (dto.accountId as string | undefined)?.trim() || '',
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

  /**
   * v1.3 SUP-1: 主管标记作品为"优秀作品"。
   * 同一作品可重复标记（幂等），同时记录标记人 ID 和时间。
   * 不存在的 post → null。
   */
  async markSupervisorPick(id: string, pickedBy: string): Promise<{ id: string; isSupervisorPicked: number } | null> {
    const post = await this.postRepository.findOne({ where: { id } });
    if (!post) return null;
    await this.postRepository.update(id, {
      isSupervisorPicked: 1,
      supervisorPickedBy: pickedBy,
      supervisorPickedAt: new Date(),
    });
    return { id, isSupervisorPicked: 1 };
  }

  /**
   * v1.3 SUP-1: 主管取消标记。
   * 幂等：已是未标记状态再调用也返回 ok。
   */
  async unmarkSupervisorPick(id: string): Promise<{ id: string; isSupervisorPicked: number } | null> {
    const post = await this.postRepository.findOne({ where: { id } });
    if (!post) return null;
    await this.postRepository.update(id, {
      isSupervisorPicked: 0,
      supervisorPickedBy: null,
      supervisorPickedAt: null,
    });
    return { id, isSupervisorPicked: 0 };
  }

  /**
   * v1.3 OP-8: 学习榜单（学习榜）维度切换数据源。
   * - dimension: traffic（流量 = likes + comments + favorites）/ leads（关联客资数）/ composite（综合 = 流量 * 权重 + 客资数 * 权重）
   * - days: 仅统计近 N 天 published 的作品，默认 30
   * - platform: 可选平台过滤（小红书 / 抖音）
   * - limit: 返回前 N 条，默认 20
   *
   * 返回每个作品 + 流量 / 客资 / 综合分值，供前端根据当前维度切换排序。
   */
  async getLearningBoard(
    params: {
      dimension?: 'traffic' | 'leads' | 'composite';
      days?: number;
      platform?: string;
      limit?: number;
    } = {},
    viewer?: PostViewer,
  ): Promise<{
    dimension: 'traffic' | 'leads' | 'composite';
    items: any[];
  }> {
    const dimension = (['traffic', 'leads', 'composite'] as const).includes(
      params.dimension as any,
    )
      ? (params.dimension as 'traffic' | 'leads' | 'composite')
      : 'composite';
    const days = Math.max(1, Math.min(Number(params.days) || 30, 365));
    const limit = Math.max(1, Math.min(Number(params.limit) || 20, 200));
    const platform = String(params.platform || '').trim();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days + 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const whereParts: string[] = ['p.published_at >= ?'];
    const whereParams: any[] = [cutoffStr];

    if (platform) {
      whereParts.push('p.platform = ?');
      whereParams.push(platform);
    }

    const whereClause = whereParts.join(' AND ');

    // traffic = likes + comments + favorites（不含 shares，与 v1.3 OP-16 流量口径一致）
    // leads_count = 关联 lead 数（post_id IS NOT NULL）
    // composite_score = traffic * 1 + leads_count * 50（粗略权重，使客资价值显著高于纯流量）
    const sql = `
      SELECT
        p.id, p.employee_id, p.account_id, p.platform, p.title, p.copywriting,
        p.cover_image_url, p.cover_thumb_url, p.post_url, p.post_type, p.traffic,
        p.likes, p.comments, p.favorites, p.shares,
        p.metrics_updated_at, p.published_at, p.note, p.supervisor_suggestion,
        p.is_supervisor_picked, p.supervisor_picked_by, p.supervisor_picked_at,
        p.created_at, p.updated_at,
        e.name AS employee_name,
        a.account_name,
        (COALESCE(p.likes, 0) + COALESCE(p.comments, 0) + COALESCE(p.favorites, 0)) AS traffic_score,
        COALESCE(lc.cnt, 0) AS leads_count,
        COALESCE(fc.cnt, 0) AS favorite_count,
        ((COALESCE(p.likes, 0) + COALESCE(p.comments, 0) + COALESCE(p.favorites, 0))
          + COALESCE(lc.cnt, 0) * 50) AS composite_score
      FROM posts p
      LEFT JOIN employees e ON e.id COLLATE utf8mb4_unicode_ci = p.employee_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN accounts a ON a.id COLLATE utf8mb4_unicode_ci = p.account_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS cnt
        FROM leads
        WHERE post_id IS NOT NULL
        GROUP BY post_id
      ) lc ON lc.post_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
        SELECT target_id, COUNT(*) AS cnt
        FROM favorites
        WHERE target_type = 'post'
        GROUP BY target_id
      ) fc ON fc.target_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
      WHERE ${whereClause}
      ORDER BY composite_score DESC, leads_count DESC, traffic_score DESC, p.published_at DESC
      LIMIT ?
    `;

    const dataParams: any[] = [...whereParams, limit];
    const rows: any[] = await this.postRepository.query(sql, dataParams);

    const items = rows.map((row) => {
      const trafficScore = Number(row.traffic_score || 0);
      // OP-14: 暴露给客户端的 leadsCount 需根据 viewer 权限收敛；不影响排序（排序仍用 row.leads_count 原始值）
      const leadsCount = this.redactLeadsCount(row, viewer);
      const compositeScore = Number(row.composite_score || 0);
      return {
        ...this.mapPostRow(row, viewer),
        trafficScore,
        leadsCount,
        compositeScore,
        // 给前端一个统一字段
        score: dimension === 'traffic' ? trafficScore : dimension === 'leads' ? leadsCount : compositeScore,
      };
    });

    // 根据 dimension 重排
    items.sort((a, b) => {
      if (dimension === 'traffic') {
        if (b.trafficScore !== a.trafficScore) return b.trafficScore - a.trafficScore;
      } else if (dimension === 'leads') {
        if (b.leadsCount !== a.leadsCount) return b.leadsCount - a.leadsCount;
      } else {
        if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
      }
      // 次级排序：traffic_score desc
      if (b.trafficScore !== a.trafficScore) return b.trafficScore - a.trafficScore;
      // 再按发布时间倒序
      const aDate = String(a.publishedAt || '');
      const bDate = String(b.publishedAt || '');
      return bDate.localeCompare(aDate);
    });

    return { dimension, items };
  }

  /**
   * v1.3 SUP-1: 查询被主管标记的优秀作品（学习榜单"主管推荐"使用）。
   * - 默认按标记时间倒序
   * - 可按 pickedBy 过滤"我标记的"
   * - 支持分页（limit / offset 风格，兼容现有 paged 接口）
   *
   * 返回包含 employeeName / accountName（与 findPlaza 一致），便于前端直接展示。
   */
  async findSupervisorPicks(
    filters: { pickedBy?: string } = {},
    limit: number = 20,
    offset: number = 0,
    viewer?: PostViewer,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const params: any[] = [];
    const whereParts: string[] = ['p.is_supervisor_picked = 1'];

    if (filters.pickedBy) {
      whereParts.push('p.supervisor_picked_by = ?');
      params.push(filters.pickedBy);
    }

    const whereClause = whereParts.join(' AND ');

    // total
    const countSql = `
      SELECT COUNT(*) AS total
      FROM posts p
      WHERE ${whereClause}
    `;
    const countResult: any[] = await this.postRepository.query(countSql, params);
    const total = Number((countResult[0] as any)?.total || 0);

    // data
    const dataSql = `
      SELECT
        p.id, p.employee_id, p.account_id, p.platform, p.title, p.copywriting,
        p.cover_image_url, p.cover_thumb_url, p.post_url, p.post_type, p.traffic,
        p.likes, p.comments, p.favorites, p.shares,
        p.metrics_updated_at, p.published_at, p.note, p.supervisor_suggestion,
        p.is_supervisor_picked, p.supervisor_picked_by, p.supervisor_picked_at,
        p.created_at, p.updated_at,
        e.name AS employee_name,
        a.account_name,
        COALESCE(lc.cnt, 0) AS leads_count,
        COALESCE(fc.cnt, 0) AS favorite_count
      FROM posts p
      LEFT JOIN employees e ON e.id COLLATE utf8mb4_unicode_ci = p.employee_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN accounts a ON a.id COLLATE utf8mb4_unicode_ci = p.account_id COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
        SELECT post_id, COUNT(*) AS cnt
        FROM leads
        WHERE post_id IS NOT NULL
        GROUP BY post_id
      ) lc ON lc.post_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
      LEFT JOIN (
        SELECT target_id, COUNT(*) AS cnt
        FROM favorites
        WHERE target_type = 'post'
        GROUP BY target_id
      ) fc ON fc.target_id COLLATE utf8mb4_unicode_ci = p.id COLLATE utf8mb4_unicode_ci
      WHERE ${whereClause}
      ORDER BY p.supervisor_picked_at DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, safeLimit, safeOffset];
    const rows: any[] = await this.postRepository.query(dataSql, dataParams);

    const items = rows.map((row) => ({
      ...this.mapPostRow(row, viewer),
      isSupervisorPicked: Number(row.is_supervisor_picked || 0),
      supervisorPickedBy: row.supervisor_picked_by || null,
      supervisorPickedAt: row.supervisor_picked_at || null,
    }));

    return { items, total, limit: safeLimit, offset: safeOffset };
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

  /**
   * 记录指标历史，同时按天聚合到 post_metrics 表。
   * post_metrics 表按 (post_id, date) 去重。
   */
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

    // 同步到 post_metrics 按天聚合表（post_id + date 去重）
    const today = new Date().toISOString().slice(0, 10);
    await this.upsertDailyMetrics(id, today, {
      likes: Number(metrics.likes || 0),
      comments: Number(metrics.comments || 0),
      favorites: Number(metrics.favorites || 0),
      shares: Number(metrics.shares || 0),
    });
  }

  /**
   * 按 (post_id, date) 去重 upsert 到 post_metrics 表。
   * 用于排行榜和看板聚合查询。
   */
  async upsertDailyMetrics(
    postId: string,
    date: string,
    metrics: { likes?: number; comments?: number; favorites?: number; shares?: number; traffic?: number; views?: number },
  ): Promise<void> {
    const existing = await this.postMetricsRepository.findOne({
      where: { postId, date: new Date(date) },
    });
    if (existing) {
      await this.postMetricsRepository.update(existing.id, {
        likes: metrics.likes ?? existing.likes,
        comments: metrics.comments ?? existing.comments,
        favorites: metrics.favorites ?? existing.favorites,
        shares: metrics.shares ?? existing.shares,
        traffic: metrics.traffic ?? existing.traffic,
        views: metrics.views ?? existing.views,
      });
    } else {
      await this.postMetricsRepository.save(this.postMetricsRepository.create({
        id: makeId(),
        postId,
        date: new Date(date),
        likes: metrics.likes ?? 0,
        comments: metrics.comments ?? 0,
        favorites: metrics.favorites ?? 0,
        shares: metrics.shares ?? 0,
        traffic: metrics.traffic ?? 0,
        views: metrics.views ?? 0,
      }));
    }
  }

  /**
   * 获取作品每日指标历史（用于图表展示）。
   */
  async getDailyMetrics(postId: string, fromDate?: string, toDate?: string): Promise<any[]> {
    const qb = this.postMetricsRepository.createQueryBuilder('pm')
      .where('pm.post_id = :postId', { postId })
      .orderBy('pm.date', 'DESC');

    if (fromDate) qb.andWhere('pm.date >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('pm.date <= :toDate', { toDate });

    const rows = await qb.getMany();
    return rows.map((r) => ({
      postId: r.postId,
      date: r.date,
      likes: Number(r.likes || 0),
      comments: Number(r.comments || 0),
      favorites: Number(r.favorites || 0),
      shares: Number(r.shares || 0),
      traffic: Number(r.traffic || 0),
      views: Number(r.views || 0),
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

  private mapPostRow(row: any, viewer?: PostViewer): any {
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
      isSupervisorPicked: Number(row.is_supervisor_picked ?? 0),
      supervisorPickedBy: row.supervisor_picked_by ?? null,
      supervisorPickedAt: row.supervisor_picked_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // OP-14: leadsCount 涉及客户跟进量，仅作者本人 + supervisor/admin/owner 见真实值
      leadsCount: this.redactLeadsCount(row, viewer),
      favoriteCount: Number(row.favorite_count || 0),
      isFavorited: Number(row.is_favorited || 0) === 1,
    };
  }

  /**
   * v1.3 OP-14: 判断 viewer 是否有权查看当前 row 的真实 leadsCount。
   * - 作品作者本人 (row.employee_id === viewer.employeeId)
   * - supervisor / admin / owner
   * 其余返回 0。
   */
  private redactLeadsCount(row: any, viewer?: PostViewer): number {
    const raw = Number(row.leads_count || 0);
    if (!viewer) return 0;
    const role = String(viewer.role || '').toLowerCase();
    if (['supervisor', 'admin', 'owner'].includes(role)) return raw;
    if (viewer.employeeId && row.employee_id && String(viewer.employeeId) === String(row.employee_id)) {
      return raw;
    }
    return 0;
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
      isSupervisorPicked: Number((row as any).isSupervisorPicked ?? 0),
      supervisorPickedBy: (row as any).supervisorPickedBy ?? null,
      supervisorPickedAt: (row as any).supervisorPickedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      // 个人化字段：默认 false/0，decorateWithFavorites 步骤会按当前 viewer 覆盖
      //  - isFavorited: 当前用户是否已收藏（按 viewerUserId 判断）
      //  - favoriteCount: 作品被收藏的总数（直接用 posts.favorites 列，避免 N+1）
      isFavorited: false,
      favoriteCount: Number((row as any).favorites || 0),
    };
  }

  /**
   * 批量给一组 post 输出注入 isFavorited 字段。
   * 走 FavoritesService.ids 一次查回当前 viewer 收藏过的所有 post id，
   * 然后 O(1) 判断每条 item 命中情况。**不**逐条 query → 避免 N+1。
   *
   * 兜底：favoritesService 未注入（@Optional）或 viewer 未登录 → 不抛错，全置 false。
   */
  private async decorateWithFavorites(items: any[], viewer?: PostsListViewer): Promise<any[]> {
    if (!items || !items.length) return items;
    const userId = String(viewer?.viewerUserId || '').trim();
    if (!userId || !this.favoritesService) {
      // 没有 viewer / 没注入 service：保持 mapPost 里的默认 false
      return items;
    }
    let favoritedIds: string[] = [];
    try {
      favoritedIds = await this.favoritesService.ids(userId, 'post');
    } catch (err) {
      // 收藏服务异常不阻塞主列表返回
      // eslint-disable-next-line no-console
      console.error('[posts] favoritesService.ids failed', (err as any)?.message || err);
      return items;
    }
    const favSet = new Set(favoritedIds.map((id) => String(id)));
    for (const item of items) {
      if (item && item.id !== undefined) {
        item.isFavorited = favSet.has(String(item.id));
      }
    }
    return items;
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
