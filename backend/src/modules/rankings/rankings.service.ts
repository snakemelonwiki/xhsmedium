import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { DashboardService } from '../dashboard/dashboard.service';
import { PostsService } from '../posts/posts.service';
import { LeadsService } from '../leads/leads.service';
import { normalizePostType, normalizeTrafficByType } from '../../shared/utils/normalize';

@Injectable()
export class RankingsService {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly postsService: PostsService,
    private readonly leadsService: LeadsService,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
  ) {}

  /**
   * 排行榜入口，支持 4 类榜单和 7 种周期。
   * - type: posts / leads / traffic / study
   * - period: today / week / month / total / 7d / 14d / 30d
   * - date: 兼容旧前端单日参数
   * - options.platform: xhs / douyin / 小红书 / 抖音（filter posts & leads）
   *
   * 作品数榜：排除删除、重复、无效作品
   * 客资榜：排除重复、无联系方式且不可跟进客资
   * 流量榜：按点赞数排序
   * 学习榜：按客资数优先，客资相同再看获客效率和点赞数
   */
  async getRankings(
    type: string,
    date: string,
    options: { period?: string; platform?: string } = {},
  ): Promise<any[]> {
    const range = this.resolveDateRange(date, options.period);
    const rows = await this.dashboardService.rankingRows(date, {
      from: range.from,
      to: range.to,
      platform: options.platform,
    });

    // 历史 total post 计数（不限日期，限平台），用于"累计作品/累计客资"等指标
    const platformFilter = this.normalizePlatform(options.platform);
    const posts = (await this.postsService.findAll()).filter(
      (p) => !platformFilter || p.platform === platformFilter,
    );
    const leads = (await this.leadsService.findAll()).filter(
      (l) => !platformFilter || l.platform === platformFilter,
    );

    // 作品数榜：排除删除、重复、无效作品（通过 postsService.findAll 已过滤）
    if (type === 'posts') {
      const postCountByEmployee: Record<string, { total: number; xhs: number; douyin: number }> = {};
      for (const post of posts) {
        if (!postCountByEmployee[post.employeeId]) {
          postCountByEmployee[post.employeeId] = { total: 0, xhs: 0, douyin: 0 };
        }
        postCountByEmployee[post.employeeId].total++;
        if (post.platform === '小红书') postCountByEmployee[post.employeeId].xhs++;
        if (post.platform === '抖音') postCountByEmployee[post.employeeId].douyin++;
      }
      return rows
        .map((r) => ({
          ...r,
          postCount: postCountByEmployee[r.employeeId]?.total || 0,
          xhsPostCount: postCountByEmployee[r.employeeId]?.xhs || 0,
          douyinPostCount: postCountByEmployee[r.employeeId]?.douyin || 0,
        }))
        .sort((a, b) => b.postCount - a.postCount);
    }

    // 客资榜：排除重复、无联系方式且不可跟进客资
    if (type === 'leads') {
      const leadCountByEmployee: Record<string, number> = {};
      for (const lead of leads) {
        // 排除无效客资（无联系方式且不可跟进）
        if (!lead.contactInfo && lead.status === 'invalid') continue;
        leadCountByEmployee[lead.employeeId] = (leadCountByEmployee[lead.employeeId] || 0) + 1;
      }
      return rows
        .map((r) => ({
          ...r,
          leadCount: leadCountByEmployee[r.employeeId] || 0,
        }))
        .sort((a, b) => b.leadCount - a.leadCount);
    }

    // 流量榜：按 SUM(likes+comments+favorites) 排序
    // v1.3 OP-7：运营统一口径——流量 = 点赞 + 评论 + 收藏（不含 shares），与 OP-16 一致。
    if (type === 'traffic') {
      const trafficByEmployee: Record<string, number> = {};
      for (const post of posts) {
        const score = Number(post.likes || 0) + Number(post.comments || 0) + Number(post.favorites || 0);
        trafficByEmployee[post.employeeId] = (trafficByEmployee[post.employeeId] || 0) + score;
      }
      return rows
        .map((r) => ({
          ...r,
          traffic: trafficByEmployee[r.employeeId] || 0,
          likes: trafficByEmployee[r.employeeId] || 0, // 兼容老前端：traffic / likes 都用同一数值
        }))
        .sort((a, b) => b.traffic - a.traffic);
    }

    // 学习榜：按客资数优先，客资相同再看获客效率和点赞数
    if (type === 'study') {
      const studyByEmployee: Record<string, { leads: number; posts: number; likes: number }> = {};
      for (const post of posts) {
        if (!studyByEmployee[post.employeeId]) {
          studyByEmployee[post.employeeId] = { leads: 0, posts: 0, likes: 0 };
        }
        studyByEmployee[post.employeeId].posts++;
        studyByEmployee[post.employeeId].likes += Number(post.likes || 0);
      }
      for (const lead of leads) {
        if (studyByEmployee[lead.employeeId]) {
          studyByEmployee[lead.employeeId].leads++;
        }
      }
      return rows
        .map((r) => ({
          ...r,
          leads: studyByEmployee[r.employeeId]?.leads || 0,
          posts: studyByEmployee[r.employeeId]?.posts || 0,
          likes: studyByEmployee[r.employeeId]?.likes || 0,
          efficiency: studyByEmployee[r.employeeId]
            ? Number((studyByEmployee[r.employeeId].leads / studyByEmployee[r.employeeId].posts).toFixed(2))
            : 0,
        }))
        .sort((a, b) => {
          if (b.leads !== a.leads) return b.leads - a.leads;
          if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
          return b.likes - a.likes;
        });
    }

    return rows;
  }

  async getRankingsPaged(
    type: string,
    date: string,
    limit: number,
    offset: number,
    options: { period?: string; platform?: string } = {},
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    // TODO: 当前为内存分页，getRankings 会全量加载 posts + leads。当数据量增长时，
    // 需要将聚合逻辑下沉到 SQL，避免全表加载后再 slice。后续可改为纯 SQL 聚合或缓存。
    const allRows = await this.getRankings(type, date, options);
    const total = allRows.length;
    const items = allRows.slice(offset, offset + limit);
    return { items, total, limit, offset };
  }

  /**
   * 解析周期参数。
   * 支持: today / week / month / total / 7d / 14d / 30d
   */
  private resolveDateRange(date: string, period?: string): { from?: string; to?: string } {
    const p = String(period || '').trim().toLowerCase();
    const to = new Date(date);
    if (isNaN(to.getTime())) {
      return {};
    }
    const today = to.toISOString().slice(0, 10);

    if (!p || p === 'today') return {};

    // 近 N 天
    if (p === '7d' || p === '7') {
      const from = new Date(to);
      from.setDate(from.getDate() - 6);
      return { from: from.toISOString().slice(0, 10), to: today };
    }
    if (p === '14d' || p === '14') {
      const from = new Date(to);
      from.setDate(from.getDate() - 13);
      return { from: from.toISOString().slice(0, 10), to: today };
    }
    if (p === '30d' || p === '30') {
      const from = new Date(to);
      from.setDate(from.getDate() - 29);
      return { from: from.toISOString().slice(0, 10), to: today };
    }

    // 本周
    if (['week', 'thisweek', '本周'].includes(p)) {
      const from = new Date(to);
      const day = from.getDay() || 7;
      from.setDate(from.getDate() - day + 1);
      return { from: from.toISOString().slice(0, 10), to: today };
    }

    // 本月
    if (['month', 'thismonth', '本月'].includes(p)) {
      const from = new Date(to.getFullYear(), to.getMonth(), 1);
      return { from: from.toISOString().slice(0, 10), to: today };
    }

    // 累计
    if (['all', 'total', '累计'].includes(p)) {
      return { from: '1970-01-01', to: today };
    }

    return {};
  }

  private normalizePlatform(p?: string): string | null {
    const raw = String(p || '').trim().toLowerCase();
    if (!raw) return null;
    if (raw === 'xhs' || raw === '小红书') return '小红书';
    if (raw === 'douyin' || raw === '抖音') return '抖音';
    return null;
  }

  async getLearningPosts(days: number = 7, userId = ''): Promise<any[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const sql = `
      SELECT
        p.id, p.employee_id, p.account_id, p.platform, p.title, p.copywriting,
        p.cover_image_url, p.post_url, p.post_type, p.traffic,
        p.likes, p.comments, p.favorites, p.shares,
        p.metrics_updated_at, p.published_at,
        p.created_at, p.updated_at,
        (SELECT COUNT(*) FROM leads l WHERE l.post_id = p.id) AS leads_count,
        EXISTS(
          SELECT 1 FROM favorites fav
          WHERE fav.target_type = 'post'
            AND fav.target_id = p.id COLLATE utf8mb4_unicode_ci
            AND fav.user_id = ?
        ) AS is_favorited
      FROM posts p
      WHERE p.published_at >= ?
      HAVING leads_count >= 1
      ORDER BY leads_count DESC, p.likes DESC, p.published_at DESC, p.created_at DESC
      LIMIT 10
    `;

    const rows = await this.postRepository.query(sql, [userId || '', cutoffStr]);
    return (rows as any[]).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      accountId: row.account_id,
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      leadCount: Number(row.leads_count || 0),
      leadsCount: Number(row.leads_count || 0),
      isFavorited: Number(row.is_favorited || 0) === 1,
    }));
  }
}
