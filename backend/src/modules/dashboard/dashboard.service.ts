import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';
import { Employee } from '../../entities/employee.entity';
import { Account } from '../../entities/account.entity';
import { Order } from '../../entities/order.entity';
import { normalizePostType } from '../../shared/utils/normalize';
import { todayString } from '../../shared/utils/date-utils';
import { CacheService } from '../../shared/cache.service';

/** 5 分钟缓存 TTL（毫秒） */
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly cache: CacheService,
  ) {}

  async getSummary(today: string = todayString()): Promise<any> {
    const cacheKey = `dashboard:summary:${today}`;
    const cached = this.cache.get<ReturnType<typeof this.computeSummary>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computeSummary(today);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computeSummary(today: string): Promise<any> {
    const [updatedEmployees, updatedAccounts, xhsPosts, douyinPosts, xhsMetrics, douyinMetrics, leads, deals, abnormalOrders] = await Promise.all([
      this.postRepo.createQueryBuilder('p').select('COUNT(DISTINCT p.employeeId)', 'count').where('p.publishedAt = :today', { today }).getRawOne(),
      this.postRepo.createQueryBuilder('p').select('COUNT(DISTINCT p.accountId)', 'count').where('p.publishedAt = :today', { today }).getRawOne(),
      this.postRepo.createQueryBuilder('p').select('COUNT(*)', 'count').where('p.publishedAt = :today AND p.platform = :platform', { today, platform: '小红书' }).getRawOne(),
      this.postRepo.createQueryBuilder('p').select('COUNT(*)', 'count').where('p.publishedAt = :today AND p.platform = :platform', { today, platform: '抖音' }).getRawOne(),
      this.postRepo.createQueryBuilder('p')
        .select('COALESCE(SUM(p.likes), 0)', 'likes')
        .addSelect('COALESCE(SUM(p.comments), 0)', 'comments')
        .addSelect('COALESCE(SUM(p.favorites), 0)', 'favorites')
        .addSelect(`COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴', '营销贴') THEN p.traffic ELSE 0 END), 0)`, 'traffic')
        .where('p.publishedAt = :today AND p.platform = :platform', { today, platform: '小红书' }).getRawOne(),
      this.postRepo.createQueryBuilder('p')
        .select('COALESCE(SUM(p.likes), 0)', 'likes')
        .addSelect('COALESCE(SUM(p.comments), 0)', 'comments')
        .addSelect('COALESCE(SUM(p.favorites), 0)', 'favorites')
        .addSelect(`COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴', '营销贴') THEN p.traffic ELSE 0 END), 0)`, 'traffic')
        .where('p.publishedAt = :today AND p.platform = :platform', { today, platform: '抖音' }).getRawOne(),
      this.leadRepo.createQueryBuilder('l').select('COUNT(*)', 'count').where('DATE(l.createdAt) = :today', { today }).getRawOne(),
      this.leadRepo.createQueryBuilder('l').select('COUNT(*)', 'count').where("DATE(l.createdAt) = :today AND l.status = '已成交'", { today }).getRawOne(),
      this.orderRepo.createQueryBuilder('o').select('COUNT(*)', 'count').where("o.orderStatus = 'abnormal'").getRawOne(),
    ]);

    return {
      updatedEmployees: Number(updatedEmployees?.count || 0),
      updatedAccounts: Number(updatedAccounts?.count || 0),
      xhsPosts: Number(xhsPosts?.count || 0),
      douyinPosts: Number(douyinPosts?.count || 0),
      todayLeads: Number(leads?.count || 0),
      todayDeals: Number(deals?.count || 0),
      douyinLikes: Number(douyinMetrics?.likes || 0),
      douyinComments: Number(douyinMetrics?.comments || 0),
      douyinFavorites: Number(douyinMetrics?.favorites || 0),
      xhsLikes: Number(xhsMetrics?.likes || 0),
      xhsComments: Number(xhsMetrics?.comments || 0),
      xhsFavorites: Number(xhsMetrics?.favorites || 0),
      douyinTraffic: Number(douyinMetrics?.traffic || 0),
      xhsTraffic: Number(xhsMetrics?.traffic || 0),
      abnormalOrders: Number(abnormalOrders?.count || 0),
    };
  }

  async getPostTypeDistribution(today: string = todayString()): Promise<any[]> {
    const cacheKey = `dashboard:post-type-dist:${today}`;
    const cached = this.cache.get<ReturnType<typeof this.computePostTypeDistribution>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computePostTypeDistribution(today);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computePostTypeDistribution(today: string): Promise<any[]> {
    const rawRows = await this.postRepo.query(
      `SELECT post_type, COUNT(*) AS count FROM posts WHERE published_at = ? GROUP BY post_type`,
      [today],
    );
    const rows = rawRows as Array<{ post_type: string; count: string }>;
    const aggregated: Record<string, number> = {};
    for (const item of rows) {
      const type = normalizePostType(item.post_type);
      aggregated[type] = (aggregated[type] || 0) + Number(item.count || 0);
    }
    const total = Object.values(aggregated).reduce((s, v) => s + v, 0) || 1;
    return ['素人贴', '话题贴', '获客贴'].map((type) => {
      const count = Number(aggregated[type] || 0);
      return { type, count, ratio: `${Math.round((count / total) * 100)}%` };
    });
  }

  /**
   * 个人看板统计，运营端与主管查看员工时共用。
   */
  async getPersonalDashboard(
    employeeId: string,
    range: { from?: string; to?: string } = {},
  ): Promise<any> {
    const { from, to } = this.resolveRange(range);
    const cacheKey = `dashboard:personal:${employeeId}:${from}:${to}`;
    const cached = this.cache.get<ReturnType<typeof this.computePersonalDashboard>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computePersonalDashboard(employeeId, from, to);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computePersonalDashboard(employeeId: string, from: string, to: string): Promise<any> {
    const postQb = this.postRepo.createQueryBuilder('p')
      .where('p.employee_id = :employeeId', { employeeId })
      .andWhere('p.published_at BETWEEN :from AND :to', { from, to });
    const leadQb = this.leadRepo.createQueryBuilder('l')
      .where('l.employee_id = :employeeId', { employeeId })
      .andWhere('DATE(l.created_at) BETWEEN :from AND :to', { from, to });

    const [postAgg, leadCount, accountCount, accountRows, calendarRows, topPosts] = await Promise.all([
      postQb.clone()
        .select('COUNT(*)', 'postCount')
        .addSelect('COALESCE(SUM(p.likes), 0)', 'likes')
        .addSelect('COUNT(DISTINCT p.account_id)', 'activeAccountCount')
        .addSelect(`SUM(CASE WHEN p.post_type IN ('获客贴', '营销贴') THEN 1 ELSE 0 END)`, 'leadPostCount')
        .addSelect(`SUM(CASE WHEN p.post_type NOT IN ('获客贴', '营销贴') THEN 1 ELSE 0 END)`, 'nonLeadPostCount')
        .getRawOne(),
      leadQb.clone().getCount(),
      this.accountRepo.count({ where: { employeeId } as any }),
      this.postRepo.query(
        `SELECT
           p.account_id AS account_id,
           COALESCE(a.account_name, p.account_id) AS account_name,
           COUNT(*) AS post_count,
           COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴', '营销贴') THEN 1 ELSE 0 END), 0) AS lead_post_count,
           COALESCE(SUM(CASE WHEN p.post_type NOT IN ('获客贴', '营销贴') THEN 1 ELSE 0 END), 0) AS non_lead_post_count,
           COALESCE(SUM(p.likes), 0) AS likes,
           (SELECT COUNT(*) FROM leads l WHERE l.account_id = p.account_id AND DATE(l.created_at) BETWEEN ? AND ?) AS lead_count
         FROM posts p
         LEFT JOIN accounts a ON a.id = p.account_id
         WHERE p.employee_id = ? AND p.published_at BETWEEN ? AND ?
         GROUP BY p.account_id, a.account_name
         ORDER BY lead_count DESC, likes DESC
         LIMIT 20`,
        [from, to, employeeId, from, to],
      ),
      this.postRepo.query(
        `SELECT p.published_at AS date, p.account_id AS account_id, COALESCE(a.account_name, p.account_id) AS account_name,
                p.post_type AS post_type, COUNT(*) AS count
         FROM posts p
         LEFT JOIN accounts a ON a.id = p.account_id
         WHERE p.employee_id = ? AND p.published_at BETWEEN ? AND ?
         GROUP BY p.published_at, p.account_id, a.account_name, p.post_type
         ORDER BY p.published_at DESC, p.account_id
         LIMIT 120`,
        [employeeId, from, to],
      ),
      postQb.clone()
        .select(['p.id AS id', 'p.title AS title', 'p.account_id AS accountId', 'p.likes AS likes', 'p.post_type AS postType'])
        .orderBy('p.likes', 'DESC')
        .limit(10)
        .getRawMany(),
    ]);

    const postCount = Number(postAgg?.postCount || 0);
    return {
      period: { from, to },
      employeeId,
      overview: {
        postCount,
        leadCount,
        likes: Number(postAgg?.likes || 0),
        activeAccountCount: Number(postAgg?.activeAccountCount || 0),
        accountCount,
        leadPostCount: Number(postAgg?.leadPostCount || 0),
        nonLeadPostCount: Number(postAgg?.nonLeadPostCount || 0),
      },
      rankings: {
        leadAccounts: accountRows.map((row: any) => this.mapAccountRanking(row)),
        efficiencyAccounts: accountRows.map((row: any) => this.mapAccountRanking(row))
          .sort((a: any, b: any) => b.leadsPerPost - a.leadsPerPost),
        trafficPosts: topPosts.map((row: any) => ({
          id: row.id,
          title: row.title,
          accountId: row.accountId,
          likes: Number(row.likes || 0),
          postType: normalizePostType(row.postType),
        })),
        nonLeadPostAccounts: accountRows.map((row: any) => this.mapAccountRanking(row))
          .sort((a: any, b: any) => b.nonLeadPostCount - a.nonLeadPostCount),
      },
      accountCalendar: calendarRows.map((row: any) => ({
        date: row.date,
        accountId: row.account_id,
        accountName: row.account_name,
        postType: normalizePostType(row.post_type),
        count: Number(row.count || 0),
      })),
    };
  }

  /**
   * 主管总览统计，支撑作品、客资、互动、有效账号与风险卡片。
   */
  async getSupervisorOverview(period: string = 'today'): Promise<any> {
    const { from, to } = this.resolvePeriod(period);
    const cacheKey = `dashboard:supervisor:overview:${period}:${from}:${to}`;
    const cached = this.cache.get<ReturnType<typeof this.computeSupervisorOverview>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computeSupervisorOverview(from, to, period);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computeSupervisorOverview(from: string, to: string, period: string): Promise<any> {
    const [postAgg, leadAgg, activeAccountCount, pendingCollab, employees] = await Promise.all([
      this.postRepo.createQueryBuilder('p')
        .select('COUNT(*)', 'postCount')
        .addSelect('COALESCE(SUM(p.likes), 0)', 'likes')
        .addSelect('COALESCE(SUM(p.comments), 0)', 'comments')
        .addSelect('COALESCE(SUM(p.favorites), 0)', 'favorites')
        .where('p.published_at BETWEEN :from AND :to', { from, to })
        .getRawOne(),
      this.leadRepo.createQueryBuilder('l')
        .select('COUNT(*)', 'leadCount')
        .addSelect(`SUM(CASE WHEN l.status IN ('deal_closed', '已成交') THEN 1 ELSE 0 END)`, 'dealCount')
        .where('DATE(l.created_at) BETWEEN :from AND :to', { from, to })
        .getRawOne(),
      this.postRepo.createQueryBuilder('p')
        .select('COUNT(DISTINCT p.account_id)', 'count')
        .where('p.published_at BETWEEN :from AND :to', { from, to })
        .getRawOne(),
      this.leadRepo.query(`SELECT COUNT(*) AS count FROM collaboration_tasks WHERE status = 'pending'`),
      this.employeeRepo.count(),
    ]);
    const postCount = Number(postAgg?.postCount || 0);
    const leadCount = Number(leadAgg?.leadCount || 0);
    const pendingCount = Number(pendingCollab?.[0]?.count || 0);
    return {
      period: { from, to, code: period },
      postCount,
      leadCount,
      likes: Number(postAgg?.likes || 0),
      interactions: Number(postAgg?.likes || 0) + Number(postAgg?.comments || 0) + Number(postAgg?.favorites || 0),
      effectiveAccountCount: Number(activeAccountCount?.count || 0),
      dealCount: Number(leadAgg?.dealCount || 0),
      pendingCollaborationCount: pendingCount,
      riskReminders: {
        collaborationTimeout: pendingCount,
        leadBacklog: Math.max(leadCount - Number(leadAgg?.dealCount || 0), 0),
        lowUpdateEmployees: Math.max(employees - Number(activeAccountCount?.count || 0), 0),
        abnormalAccounts: 0,
      },
    };
  }

  /**
   * 主管基础分析看板，返回聚合结果而不是前端拉全量计算。
   */
  async getSupervisorAnalysis(filters: { platform?: string; employeeId?: string } = {}): Promise<any> {
    const platform = this.normalizePlatform(filters.platform);
    const platformKey = platform || '_all';
    const employeeIdKey = filters.employeeId || '_all';
    const cacheKey = `dashboard:supervisor:analysis:${platformKey}:${employeeIdKey}`;
    const cached = this.cache.get<ReturnType<typeof this.computeSupervisorAnalysis>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computeSupervisorAnalysis(platform, filters.employeeId);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computeSupervisorAnalysis(platform: string | null, employeeId: string | undefined): Promise<any> {
    const postWhere: string[] = ['1=1'];
    const postParams: any[] = [];
    const leadWhere: string[] = ['1=1'];
    const leadParams: any[] = [];
    if (platform) {
      postWhere.push('platform = ?');
      postParams.push(platform);
      leadWhere.push('platform = ?');
      leadParams.push(platform);
    }
    if (employeeId) {
      postWhere.push('employee_id = ?');
      postParams.push(employeeId);
      leadWhere.push('employee_id = ?');
      leadParams.push(employeeId);
    }
    const [platformTrend, postStructure, leadTrend] = await Promise.all([
      this.postRepo.query(
        `SELECT published_at AS date, platform, COUNT(*) AS post_count, COALESCE(SUM(likes), 0) AS likes
         FROM posts WHERE ${postWhere.join(' AND ')}
         GROUP BY published_at, platform ORDER BY published_at DESC LIMIT 90`,
        postParams,
      ),
      this.postRepo.query(
        `SELECT post_type AS type, COUNT(*) AS count
         FROM posts WHERE ${postWhere.join(' AND ')}
         GROUP BY post_type ORDER BY count DESC`,
        postParams,
      ),
      this.leadRepo.query(
        `SELECT DATE(created_at) AS date, platform, COUNT(*) AS lead_count
         FROM leads WHERE ${leadWhere.join(' AND ')}
         GROUP BY DATE(created_at), platform ORDER BY DATE(created_at) DESC LIMIT 90`,
        leadParams,
      ),
    ]);
    return {
      filters: { platform, employeeId: employeeId || '' },
      platformTrend: platformTrend.map((row: any) => ({
        date: row.date,
        platform: row.platform,
        postCount: Number(row.post_count || 0),
        likes: Number(row.likes || 0),
      })),
      postStructure: postStructure.map((row: any) => ({
        type: normalizePostType(row.type),
        count: Number(row.count || 0),
      })),
      leadTrend: leadTrend.map((row: any) => ({
        date: row.date,
        platform: row.platform,
        leadCount: Number(row.lead_count || 0),
      })),
    };
  }

  /**
   * 排行榜每行的核心计数。
   * - 不传 from/to：保留旧行为，按单日 `today` 聚合（today* 含义保持向后兼容）
   * - 传 from..to：按日期区间聚合，仍以 today* 命名返回（前端字段不变），适配主管端"周/月榜"
   * - platform：可选过滤具体平台（'小红书' / '抖音' / 'xhs' / 'douyin'）
   */
  async rankingRows(
    today: string = todayString(),
    options: { from?: string; to?: string; platform?: string } = {},
  ): Promise<any[]> {
    const platform = this.normalizePlatform(options.platform);
    const useRange = !!(options.from || options.to);
    const from = options.from || today;
    const to = options.to || today;
    const platformKey = platform || '_all';
    const cacheKey = `dashboard:rankings:${today}:${from}:${to}:${platformKey}`;
    const cached = this.cache.get<ReturnType<typeof this.computeRankingRows>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computeRankingRows(today, from, to, platform, useRange);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computeRankingRows(
    today: string,
    from: string,
    to: string,
    platform: string | null,
    useRange: boolean,
  ): Promise<any[]> {
    const dateClause = useRange
      ? 'p.published_at BETWEEN ? AND ?'
      : 'p.published_at = ?';
    const leadDateClause = useRange
      ? 'DATE(l.created_at) BETWEEN ? AND ?'
      : 'DATE(l.created_at) = ?';
    const platformClause = platform ? ' AND p.platform = ?' : '';
    const leadPlatformClause = platform ? ' AND l.platform = ?' : '';

    const dateParams = (cl: string) =>
      cl.includes('BETWEEN') ? [from, to] : [today];
    const platformParam = platform ? [platform] : [];

    const accountPlatformClause = platform ? ' AND a.platform = ?' : '';
    const accountParams = platform ? [platform] : [];

    const params: any[] = [
      ...accountParams,
      ...dateParams(dateClause), ...platformParam,
      ...dateParams(leadDateClause), ...platformParam,
      ...dateParams(dateClause), ...platformParam,
      ...dateParams(leadDateClause), ...platformParam,
    ];

    const raw = await this.employeeRepo.query(
      `SELECT
         e.id AS employee_id,
         e.name,
         (SELECT COUNT(*) FROM accounts a WHERE a.employee_id = e.id${accountPlatformClause}) AS account_count,
         (SELECT COUNT(*) FROM posts p WHERE p.employee_id = e.id AND ${dateClause}${platformClause}) AS today_posts,
         (SELECT COUNT(*) FROM leads l WHERE l.employee_id = e.id AND ${leadDateClause}${leadPlatformClause}) AS today_leads,
         (SELECT COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴', '营销贴') THEN p.traffic ELSE 0 END), 0)
            FROM posts p WHERE p.employee_id = e.id AND ${dateClause}${platformClause}) AS today_traffic,
         (SELECT COUNT(*) FROM leads l WHERE l.employee_id = e.id AND ${leadDateClause}${leadPlatformClause} AND l.status = '已成交') AS today_deals
       FROM employees e
       ORDER BY e.created_at DESC`,
      params,
    );

    return (raw as any[]).map((row) => ({
      employeeId: row.employee_id,
      name: row.name,
      accountCount: Number(row.account_count || 0),
      todayPosts: Number(row.today_posts || 0),
      todayLeads: Number(row.today_leads || 0),
      todayTraffic: Number(row.today_traffic || 0),
      todayDeals: Number(row.today_deals || 0),
    }));
  }

  private normalizePlatform(p?: string): string | null {
    const raw = String(p || '').trim().toLowerCase();
    if (!raw) return null;
    if (raw === 'xhs' || raw === '小红书') return '小红书';
    if (raw === 'douyin' || raw === '抖音') return '抖音';
    return null;
  }

  private resolveRange(range: { from?: string; to?: string }): { from: string; to: string } {
    const today = todayString();
    const now = new Date(today);
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return {
      from: range.from || firstDay,
      to: range.to || today,
    };
  }

  private resolvePeriod(period: string): { from: string; to: string } {
    const today = todayString();
    const to = new Date(today);
    const normalized = String(period || '').toLowerCase();
    const from = new Date(to);
    if (['week', 'thisweek', '本周'].includes(normalized)) {
      const day = from.getDay() || 7;
      from.setDate(from.getDate() - day + 1);
    } else if (['month', 'thismonth', '本月'].includes(normalized)) {
      from.setDate(1);
    } else if (['all', 'total', '累计'].includes(normalized)) {
      return { from: '1970-01-01', to: today };
    }
    return { from: from.toISOString().slice(0, 10), to: today };
  }

  private mapAccountRanking(row: any): any {
    const postCount = Number(row.post_count || 0);
    const leadCount = Number(row.lead_count || 0);
    return {
      accountId: row.account_id,
      accountName: row.account_name,
      postCount,
      leadPostCount: Number(row.lead_post_count || 0),
      nonLeadPostCount: Number(row.non_lead_post_count || 0),
      likes: Number(row.likes || 0),
      leadCount,
      leadsPerPost: postCount ? Number((leadCount / postCount).toFixed(2)) : 0,
    };
  }

  async refreshEnteredData(): Promise<any> {
    const today = todayString();
    const [postCount, leadCount] = await Promise.all([
      this.postRepo.createQueryBuilder('p')
        .select('COUNT(*)', 'count')
        .where('p.publishedAt = :today', { today })
        .getRawOne(),
      this.leadRepo.createQueryBuilder('l')
        .select('COUNT(*)', 'count')
        .where('DATE(l.createdAt) = :today', { today })
        .getRawOne(),
    ]);
    return {
      ok: true,
      postCount: Number(postCount?.count || 0),
      leadCount: Number(leadCount?.count || 0),
    };
  }

  /**
   * 清除所有 dashboard 相关缓存。
   * 在 posts / leads / accounts 发生写操作后调用（P-P1-03 缓存失效）。
   *
   * 使用场景（各模块 service 层）：
   *   posts.service.ts  : create / update / refreshMetrics → call invalidateAll()
   *   leads.service.ts   : create / update               → call invalidateAll()
   *   accounts.service.ts: create / update               → call invalidateAll()
   *
   * 也可按需清除特定 key（覆盖更大范围时直接 invalidateAll 更简单）。
   */
  invalidateAll(): void {
    // dashboard:* 前缀清除所有看板缓存（今天/历史日期均清除）
    this.cache.deleteByPrefix('dashboard:');
  }

  /**
   * 仅清除排行榜相关缓存（posts 指标更新时调用）。
   */
  invalidateRankings(): void {
    this.cache.deleteByPrefix('dashboard:rankings');
    this.cache.deleteByPrefix('dashboard:summary');
    this.cache.deleteByPrefix('dashboard:post-type-dist');
  }
}
