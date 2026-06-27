import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';
import { DashboardService } from '../dashboard/dashboard.service';
import { normalizePostType, normalizeTrafficByType } from '../../shared/utils/normalize';

/** 把前端中文平台名映射到 DB 中可能的所有写法（与 posts.service 同逻辑） */
function expandPlatformSynonyms(platform: string): string[] {
  const key = String(platform || '').trim();
  if (!key) return [];
  if (['xiaohongshu', 'xhs', '小红书', 'С����'].includes(key)) {
    return ['xiaohongshu', 'xhs', '小红书', 'С����'];
  }
  if (['douyin', '抖音'].includes(key)) {
    return ['douyin', '抖音'];
  }
  return [key];
}

@Injectable()
export class RankingsService {
  constructor(
    private readonly dashboardService: DashboardService,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
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
    options: { period?: string; platform?: string; range?: { from?: string; to?: string } } = {},
  ): Promise<any[]> {
    const range = this.resolveDateRange(date, options.period, options.range);
    const rows = await this.dashboardService.rankingRows(date, {
      from: range.from,
      to: range.to,
      platform: options.platform,
    });

    // C2 修复：将日期/平台过滤下沉到 SQL，避免全量加载后再内存过滤
    const platformFilter = this.normalizePlatform(options.platform);

    // --- posts: SQL 级别 from/to + platform 过滤 ---
    const postQb = this.postRepository.createQueryBuilder('p')
      .select([
        'p.id', 'p.employeeId', 'p.platform', 'p.title',
        'p.likes', 'p.comments', 'p.favorites', 'p.shares',
        'p.publishedAt', 'p.createdAt',
      ]);
    if (range.from) postQb.andWhere('p.published_at >= :from', { from: range.from });
    if (range.to) postQb.andWhere('p.published_at <= :to', { to: `${range.to} 23:59:59` });
    if (platformFilter) {
      postQb.andWhere('p.platform IN (:...platforms)', { platforms: expandPlatformSynonyms(platformFilter) });
    }
    const posts = (await postQb.getMany()).map((p) => ({
      employeeId: p.employeeId,
      platform: p.platform,
      likes: Number(p.likes || 0),
      comments: Number(p.comments || 0),
      favorites: Number(p.favorites || 0),
      shares: Number(p.shares || 0),
      publishedAt: p.publishedAt,
      createdAt: p.createdAt,
    }));

    // --- leads: SQL 级别 from/to + platform 过滤 ---
    const leadQb = this.leadRepository.createQueryBuilder('l')
      .select(['l.id', 'l.employeeId', 'l.platform', 'l.contactInfo', 'l.status', 'l.createdAt']);
    if (range.from) leadQb.andWhere('l.created_at >= :from', { from: range.from });
    if (range.to) leadQb.andWhere('l.created_at <= :to', { to: `${range.to} 23:59:59` });
    if (platformFilter) {
      leadQb.andWhere('l.platform IN (:...platforms)', { platforms: expandPlatformSynonyms(platformFilter) });
    }
    const leads = (await leadQb.getMany()).map((l) => ({
      employeeId: l.employeeId,
      platform: l.platform,
      contactInfo: l.contactInfo,
      status: l.status,
      createdAt: l.createdAt,
    }));

    // 统一主榜基础指标：账号数/作品数/平台作品数/成交数同表展示，type 只决定排序口径。
    const mergedMetricRows = () => {
      const postCountByEmployee: Record<string, { total: number; xhs: number; douyin: number }> = {};
      const leadCountByEmployee: Record<string, { total: number; xhs: number; douyin: number }> = {};
      const trafficByEmployee: Record<string, { total: number; xhs: number; douyin: number }> = {};
      for (const post of posts) {
        if (!postCountByEmployee[post.employeeId]) {
          postCountByEmployee[post.employeeId] = { total: 0, xhs: 0, douyin: 0 };
        }
        postCountByEmployee[post.employeeId].total++;
        const pf = String(post.platform || '').trim().toLowerCase();
        if (pf === '小红书' || pf === 'xiaohongshu' || pf === 'xhs') postCountByEmployee[post.employeeId].xhs++;
        if (pf === '抖音' || pf === 'douyin') postCountByEmployee[post.employeeId].douyin++;
      }
      for (const lead of leads) {
        // 排除无效客资（无联系方式且不可跟进）
        if (!lead.contactInfo && lead.status === 'invalid') continue;
        if (!leadCountByEmployee[lead.employeeId]) {
          leadCountByEmployee[lead.employeeId] = { total: 0, xhs: 0, douyin: 0 };
        }
        leadCountByEmployee[lead.employeeId].total++;
        const pf = String(lead.platform || '').trim().toLowerCase();
        if (pf === '小红书' || pf === 'xiaohongshu' || pf === 'xhs') leadCountByEmployee[lead.employeeId].xhs++;
        if (pf === '抖音' || pf === 'douyin') leadCountByEmployee[lead.employeeId].douyin++;
      }
      for (const post of posts) {
        const score = Number(post.likes || 0) + Number(post.comments || 0) + Number(post.favorites || 0);
        if (!trafficByEmployee[post.employeeId]) {
          trafficByEmployee[post.employeeId] = { total: 0, xhs: 0, douyin: 0 };
        }
        trafficByEmployee[post.employeeId].total += score;
        const pf = String(post.platform || '').trim().toLowerCase();
        if (pf === '小红书' || pf === 'xiaohongshu' || pf === 'xhs') trafficByEmployee[post.employeeId].xhs += score;
        if (pf === '抖音' || pf === 'douyin') trafficByEmployee[post.employeeId].douyin += score;
      }
      return rows.map((r) => ({
        ...r,
        postCount: postCountByEmployee[r.employeeId]?.total || 0,
        xhsPostCount: postCountByEmployee[r.employeeId]?.xhs || 0,
        douyinPostCount: postCountByEmployee[r.employeeId]?.douyin || 0,
        leadCount: leadCountByEmployee[r.employeeId]?.total || 0,
        xhsLeadCount: leadCountByEmployee[r.employeeId]?.xhs || 0,
        douyinLeadCount: leadCountByEmployee[r.employeeId]?.douyin || 0,
        traffic: trafficByEmployee[r.employeeId]?.total || 0,
        xhsTraffic: trafficByEmployee[r.employeeId]?.xhs || 0,
        douyinTraffic: trafficByEmployee[r.employeeId]?.douyin || 0,
      }));
    };

    // 作品数榜：排除删除、重复、无效作品（通过 postsService.findAll 已过滤）
    if (type === 'posts') {
      return mergedMetricRows().sort((a, b) => b.postCount - a.postCount);
    }

    // 客资榜：排除重复、无联系方式且不可跟进客资
    if (type === 'leads') {
      return mergedMetricRows().sort((a, b) => b.leadCount - a.leadCount);
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
    options: { period?: string; platform?: string; range?: { from?: string; to?: string } } = {},
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    // C2 已修复：getRankings 内部已按 from/to + platform SQL 过滤，不再全表加载。
    // 当前仍为内存分页（聚合后 slice），数据量级可控。
    const allRows = await this.getRankings(type, date, options);
    const total = allRows.length;
    const items = allRows.slice(offset, offset + limit);
    return { items, total, limit, offset };
  }

  /**
   * 解析周期参数。
   * 支持: today / week / month / total / 7d / 14d / 30d
   * 额外支持: 90d / 1y / 3y
   * 最高优先级：options.range = { from, to }（由前端 QuickRangePicker 直接传日期范围，
   *   覆盖所有 enum 推断，避免 derivePeriod 退化）。
   */
  private resolveDateRange(
    date: string,
    period?: string,
    range?: { from?: string; to?: string },
  ): { from?: string; to?: string } {
    // 1. 显式日期范围最高优先
    if (range?.from || range?.to) {
      return { from: range.from, to: range.to };
    }

    const p = String(period || '').trim().toLowerCase();
    const to = new Date(date);
    if (isNaN(to.getTime())) {
      return {};
    }
    const today = to.toISOString().slice(0, 10);

    if (!p || p === 'today') {
      // today = 当前日期当天范围（00:00 ~ 23:59）
      return { from: today, to: today };
    }

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
    // v1.3 / OP-7：排行榜接入 QuickRangePicker 12 预设后端补齐 90d / 1y / 3y
    if (p === '90d' || p === '90') {
      const from = new Date(to);
      from.setDate(from.getDate() - 89);
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

    // 本年 / 近 1 年（前端 thisYear / 1y 都映射到这里）
    if (['thisyear', '1y', '本年', '近 1 年'].includes(p)) {
      const from = new Date(to.getFullYear(), 0, 1);
      return { from: from.toISOString().slice(0, 10), to: today };
    }
    // 近 3 年
    if (p === '3y' || p === '近 3 年') {
      const from = new Date(to);
      from.setFullYear(from.getFullYear() - 3);
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
