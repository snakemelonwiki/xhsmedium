import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';
import { Employee } from '../../entities/employee.entity';
import { Account } from '../../entities/account.entity';
import { Order } from '../../entities/order.entity';
import { normalizePostType } from '../../shared/utils/normalize';
import { formatDateOnly, todayString } from '../../shared/utils/date-utils';
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
   * @deprecated 推荐使用 {@link getPersonalOverview} + {@link getPersonalRankings}。
   * 保留该方法是为兼容 v1.2 期间调用的旧前端（PersonalDashboardBoard 组件），其内部已切换到新端点。
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

  // ============================================================
  // v1.3 个人看板改造（OP-1/2/3/4/16/17/24）
  // 流量口径：likes + comments + favorites（不含分享）
  // ============================================================

  /** 个人看板参数：指标维度 / 平台 / 时间 */
  private resolvePersonalFilters(filters: {
    metrics?: string;
    platform?: string;
    period?: string;
    from?: string;
    to?: string;
  }): { metrics: string; platform: string | null; period: string; from: string; to: string } {
    const metrics = ['totalLeads', 'totalTraffic', 'efficiency', 'leadEfficiency'].includes(filters.metrics || '')
      ? filters.metrics!
      : 'totalTraffic';
    const platform = this.normalizePlatform(filters.platform);
    const period = ['today', 'week', 'month', 'all'].includes((filters.period || '').toLowerCase())
      ? (filters.period as string)
      : 'month';

    // 显式 from/to 优先，否则按 period 解析
    let from: string;
    let to: string;
    if (filters.from || filters.to) {
      const resolved = this.resolveRange({ from: filters.from, to: filters.to });
      from = resolved.from;
      to = resolved.to;
    } else {
      const resolved = this.resolvePeriod(period);
      from = resolved.from;
      to = resolved.to;
    }
    return { metrics, platform, period, from, to };
  }

  /**
   * v1.3 OP-16 个人看板 5 张概览卡 + OP-2 名次。
   *
   * 概览卡（按统一口径）：
   *   - totalTraffic     总流量 = likes + comments + favorites
   *   - totalLeads       总获客
   *   - monthPostCount   本月作品数
   *   - monthLeadCount   本月客资数
   *   - monthTraffic     本月流量
   *   - monthLeadPostCount 本月获客贴数
   *
   * 名次：按当前 metrics 维度（总流量 / 总获客 / 获客效率 / 获客贴效率）在所有员工中排名，
   * 平台 + 时间窗口与概览卡保持一致。
   */
  async getPersonalOverview(
    employeeId: string,
    filters: { metrics?: string; platform?: string; period?: string; from?: string; to?: string } = {},
  ): Promise<any> {
    const resolved = this.resolvePersonalFilters(filters);
    const cacheKey = `dashboard:personal:overview:${employeeId}:${resolved.metrics}:${resolved.platform || '_all'}:${resolved.from}:${resolved.to}`;
    const cached = this.cache.get<ReturnType<typeof this.computePersonalOverview>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computePersonalOverview(employeeId, resolved);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computePersonalOverview(
    employeeId: string,
    filters: { metrics: string; platform: string | null; period: string; from: string; to: string },
  ): Promise<any> {
    const { platform, from, to } = filters;
    const monthStart = (() => {
      const now = new Date(to);
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    })();

    // 当前员工的累计 + 本月聚合
    const paramsAll: any[] = [employeeId];
    const postWhereAll = ['p.employee_id = ?'];
    const leadWhereAll = ['l.employee_id = ?'];
    if (platform) {
      postWhereAll.push('p.platform = ?');
      paramsAll.push(platform);
      leadWhereAll.push('l.platform = ?');
      paramsAll.push(platform);
    }
    const postWhereAllSql = postWhereAll.join(' AND ');
    const leadWhereAllSql = leadWhereAll.join(' AND ');

    const [selfStats, monthStats, employeeRows] = await Promise.all([
      this.postRepo.query(
        `SELECT
           COUNT(*) AS post_count,
           COALESCE(SUM(p.likes), 0) AS likes,
           COALESCE(SUM(p.comments), 0) AS comments,
           COALESCE(SUM(p.favorites), 0) AS favorites,
           COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴','营销贴') THEN 1 ELSE 0 END), 0) AS lead_post_count
         FROM posts p WHERE ${postWhereAllSql}`,
        paramsAll,
      ).then(async (rows: any[]) => {
        const r = rows[0] || {};
        const leadCountRows = await this.leadRepo.query(
          `SELECT COUNT(*) AS cnt FROM leads l WHERE ${leadWhereAllSql}`,
          paramsAll,
        );
        return {
          postCount: Number(r.post_count || 0),
          likes: Number(r.likes || 0),
          comments: Number(r.comments || 0),
          favorites: Number(r.favorites || 0),
          leadPostCount: Number(r.lead_post_count || 0),
          leadCount: Number(leadCountRows[0]?.cnt || 0),
        };
      }),
      // 本月：仅 posts 表（指标 + 客资贴数）
      (async () => {
        const monthPostParams: any[] = [employeeId, monthStart, to];
        const monthPostWhere = ['p.employee_id = ?', 'p.published_at BETWEEN ? AND ?'];
        if (platform) {
          monthPostWhere.push('p.platform = ?');
          monthPostParams.push(platform);
        }
        const monthLeadParams: any[] = [employeeId, monthStart, to];
        const monthLeadWhere = ['l.employee_id = ?', 'DATE(l.created_at) BETWEEN ? AND ?'];
        if (platform) {
          monthLeadWhere.push('l.platform = ?');
          monthLeadParams.push(platform);
        }
        const [postRows, leadRows] = await Promise.all([
          this.postRepo.query(
            `SELECT
               COUNT(*) AS post_count,
               COALESCE(SUM(p.likes), 0) AS likes,
               COALESCE(SUM(p.comments), 0) AS comments,
               COALESCE(SUM(p.favorites), 0) AS favorites,
               COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴','营销贴') THEN 1 ELSE 0 END), 0) AS lead_post_count
             FROM posts p WHERE ${monthPostWhere.join(' AND ')}`,
            monthPostParams,
          ),
          this.leadRepo.query(
            `SELECT COUNT(*) AS cnt FROM leads l WHERE ${monthLeadWhere.join(' AND ')}`,
            monthLeadParams,
          ),
        ]);
        const r = postRows[0] || {};
        return {
          postCount: Number(r.post_count || 0),
          likes: Number(r.likes || 0),
          comments: Number(r.comments || 0),
          favorites: Number(r.favorites || 0),
          leadPostCount: Number(r.lead_post_count || 0),
          leadCount: Number(leadRows[0]?.cnt || 0),
        };
      })(),
      // 所有员工聚合：用于名次计算
      (async () => {
        const empPostParams: any[] = [];
        const empPostWhere = ['1=1'];
        if (platform) {
          empPostWhere.push('p.platform = ?');
          empPostParams.push(platform);
        }
        const empLeadParams: any[] = [];
        const empLeadWhere = ['1=1'];
        if (platform) {
          empLeadWhere.push('l.platform = ?');
          empLeadParams.push(platform);
        }
        const [rows] = await Promise.all([
          this.postRepo.query(
            `SELECT
               p.employee_id AS employee_id,
               COALESCE(e.name, p.employee_id) AS name,
               COUNT(*) AS post_count,
               COALESCE(SUM(p.likes), 0) AS likes,
               COALESCE(SUM(p.comments), 0) AS comments,
               COALESCE(SUM(p.favorites), 0) AS favorites,
               COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴','营销贴') THEN 1 ELSE 0 END), 0) AS lead_post_count
             FROM posts p
             LEFT JOIN employees e ON e.id = p.employee_id
             WHERE ${empPostWhere.join(' AND ')}
             GROUP BY p.employee_id, e.name`,
            empPostParams,
          ),
        ]);
        // 客资数按员工聚合（按时间窗口）
        const [leadRows] = await Promise.all([
          this.leadRepo.query(
            `SELECT l.employee_id AS employee_id, COUNT(*) AS lead_count
             FROM leads l WHERE ${empLeadWhere.join(' AND ')}
             GROUP BY l.employee_id`,
            empLeadParams,
          ),
        ]);
        const leadMap = new Map<string, number>();
        for (const lr of leadRows as any[]) {
          leadMap.set(lr.employee_id, Number(lr.lead_count || 0));
        }
        return (rows as any[]).map((r) => {
          const postCount = Number(r.post_count || 0);
          const leadPostCount = Number(r.lead_post_count || 0);
          const leadCount = leadMap.get(r.employee_id) || 0;
          const totalTraffic = Number(r.likes || 0) + Number(r.comments || 0) + Number(r.favorites || 0);
          const efficiency = postCount > 0 ? leadCount / postCount : 0;
          const leadEfficiency = leadPostCount > 0 ? leadCount / leadPostCount : 0;
          return {
            employeeId: r.employee_id,
            name: r.name,
            postCount,
            leadCount,
            totalTraffic,
            leadPostCount,
            efficiency,
            leadEfficiency,
          };
        });
      })(),
    ]);

    // 名次
    const ranked = this.rankEmployees(employeeRows, filters.metrics);
    const selfIndex = ranked.findIndex((r) => r.employeeId === employeeId);
    const selfRank = selfIndex >= 0 ? selfIndex + 1 : null;
    const total = ranked.length;
    const gapToPrev = selfIndex > 0 ? ranked[selfIndex - 1].metricValue - ranked[selfIndex].metricValue : 0;

    const totalTraffic = selfStats.likes + selfStats.comments + selfStats.favorites;
    const monthTraffic = monthStats.likes + monthStats.comments + monthStats.favorites;

    return {
      period: { from, to, code: filters.period, monthStart },
      employeeId,
      metrics: filters.metrics,
      platform: filters.platform,
      overview: {
        totalTraffic,
        totalLeads: selfStats.leadCount,
        monthPostCount: monthStats.postCount,
        monthLeadCount: monthStats.leadCount,
        monthTraffic,
        monthLeadPostCount: monthStats.leadPostCount,
      },
      ranking: {
        rank: selfRank,
        total,
        gapToPrev: Number(gapToPrev.toFixed(2)),
        metricValue: selfIndex >= 0 ? Number(ranked[selfIndex].metricValue.toFixed(2)) : 0,
      },
    };
  }

  /** 按当前维度对员工聚合结果排序，返回带 metricValue 的有序列表 */
  private rankEmployees(rows: Array<{
    employeeId: string;
    postCount: number;
    leadCount: number;
    totalTraffic: number;
    leadPostCount: number;
    efficiency: number;
    leadEfficiency: number;
  }>, metrics: string): Array<{ employeeId: string; metricValue: number }> {
    const key = (() => {
      switch (metrics) {
        case 'totalLeads': return (r: typeof rows[number]) => r.leadCount;
        case 'efficiency': return (r: typeof rows[number]) => r.efficiency;
        case 'leadEfficiency': return (r: typeof rows[number]) => r.leadEfficiency;
        case 'totalTraffic':
        default:
          return (r: typeof rows[number]) => r.totalTraffic;
      }
    })();
    return rows
      .map((r) => ({ employeeId: r.employeeId, metricValue: Number(key(r).toFixed(2)) }))
      .sort((a, b) => b.metricValue - a.metricValue);
  }

  /**
   * v1.3 OP-17 三大效率榜。
   *   - traffic     流量榜：按账号分组 likes+comments+favorites 之和排序
   *   - efficiency  获客效率榜：客资数 / 作品数
   *   - leadEfficiency 获客贴效率榜：客资数 / 获客贴数（仅 is_lead_post=1）
   *
   * 平台 / 时间维度均生效。OP-24 legacy 样式由前端实现，后端只负责数据。
   */
  async getPersonalRankings(
    employeeId: string,
    filters: { platform?: string; period?: string; from?: string; to?: string; sort?: string } = {},
  ): Promise<any> {
    const resolved = this.resolvePersonalFilters({ ...filters, metrics: 'totalTraffic' });
    const cacheKey = `dashboard:personal:rankings:${employeeId}:${resolved.platform || '_all'}:${resolved.from}:${resolved.to}:${filters.sort || 'leadCount'}`;
    const cached = this.cache.get<ReturnType<typeof this.computePersonalRankings>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computePersonalRankings(employeeId, resolved, filters.sort);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computePersonalRankings(
    employeeId: string,
    filters: { metrics: string; platform: string | null; period: string; from: string; to: string },
    sort?: string,
  ): Promise<any> {
    const { platform, from, to } = filters;

    // 当前员工的按账号聚合
    const selfParams: any[] = [employeeId, from, to];
    const selfPostWhere = ['p.employee_id = ?', 'p.published_at BETWEEN ? AND ?'];
    if (platform) {
      selfPostWhere.push('p.platform = ?');
      selfParams.push(platform);
    }
    const selfLeadParams: any[] = [employeeId, from, to];
    const selfLeadWhere = ['l.employee_id = ?', 'DATE(l.created_at) BETWEEN ? AND ?'];
    if (platform) {
      selfLeadWhere.push('l.platform = ?');
      selfLeadParams.push(platform);
    }

    const [accountRows] = await Promise.all([
      this.postRepo.query(
        `SELECT
           p.account_id AS account_id,
           COALESCE(a.account_name, p.account_id) AS account_name,
           a.platform AS platform,
           COUNT(*) AS post_count,
           COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴','营销贴') THEN 1 ELSE 0 END), 0) AS lead_post_count,
           COALESCE(SUM(p.likes), 0) AS likes,
           COALESCE(SUM(p.comments), 0) AS comments,
           COALESCE(SUM(p.favorites), 0) AS favorites
         FROM posts p
         LEFT JOIN accounts a ON a.id = p.account_id
         WHERE ${selfPostWhere.join(' AND ')}
         GROUP BY p.account_id, a.account_name, a.platform
         ORDER BY p.account_id`,
        selfParams,
      ),
    ]);

    // 客资按账号聚合（当前员工 + 时间窗口）
    const leadByAccountRows = await this.leadRepo.query(
      `SELECT l.account_id AS account_id, COUNT(*) AS lead_count
       FROM leads l WHERE ${selfLeadWhere.join(' AND ')}
       GROUP BY l.account_id`,
      selfLeadParams,
    );
    const leadByAccountMap = new Map<string, number>();
    for (const r of leadByAccountRows as any[]) {
      leadByAccountMap.set(r.account_id, Number(r.lead_count || 0));
    }

    // 近 7 天每日流量（用于 sparkline 趋势）
    const today = to;
    const start7 = (() => {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return d.toISOString().slice(0, 10);
    })();
    const trendParams: any[] = [employeeId, start7, today];
    const trendWhere = ['p.employee_id = ?', 'p.published_at BETWEEN ? AND ?'];
    if (platform) {
      trendWhere.push('p.platform = ?');
      trendParams.push(platform);
    }
    const trendRows = await this.postRepo.query(
      `SELECT p.account_id AS account_id,
              p.published_at AS date,
              COALESCE(SUM(p.likes), 0) AS likes,
              COALESCE(SUM(p.comments), 0) AS comments,
              COALESCE(SUM(p.favorites), 0) AS favorites
       FROM posts p WHERE ${trendWhere.join(' AND ')}
       GROUP BY p.account_id, p.published_at
       ORDER BY p.account_id, p.published_at`,
      trendParams,
    );
    const trendMap = new Map<string, number[]>();
    for (const r of trendRows as any[]) {
      const traffic = Number(r.likes || 0) + Number(r.comments || 0) + Number(r.favorites || 0);
      if (!trendMap.has(r.account_id)) trendMap.set(r.account_id, []);
      trendMap.get(r.account_id)!.push(traffic);
    }

    const accounts = (accountRows as any[]).map((r) => {
      const postCount = Number(r.post_count || 0);
      const leadPostCount = Number(r.lead_post_count || 0);
      const leadCount = leadByAccountMap.get(r.account_id) || 0;
      const traffic = Number(r.likes || 0) + Number(r.comments || 0) + Number(r.favorites || 0);
      const efficiency = postCount > 0 ? Number((leadCount / postCount).toFixed(2)) : 0;
      const leadEfficiency = leadPostCount > 0 ? Number((leadCount / leadPostCount).toFixed(2)) : 0;
      return {
        accountId: r.account_id,
        accountName: r.account_name,
        platform: r.platform,
        postCount,
        leadPostCount,
        leadCount,
        traffic,
        efficiency,
        leadEfficiency,
        trend: trendMap.get(r.account_id) || [],
      };
    });

    return {
      period: { from, to },
      employeeId,
      platform: filters.platform,
      accounts: this.sortRankings(accounts, sort),
    };
  }

  /**
   * 按 sort 字段对 accounts 重新排序。sort 不识别时按 leadCount DESC（默认）。
   * 返回 { traffic, efficiency, leadEfficiency } 三个榜单，但三个榜单共用同一组账号，
   * 排序顺序也由 sort 决定 —— 这样用户在前端选 sort 之后，三个 tab 顺序一致。
   */
  private sortRankings(accounts: any[], sort?: string): {
    traffic: any[];
    efficiency: any[];
    leadEfficiency: any[];
  } {
    const key = (a: any): number => {
      switch (sort) {
        case 'postCount':
          return a.postCount;
        case 'traffic':
          return a.traffic;
        case 'efficiency':
          return a.efficiency;
        case 'leadEfficiency':
          return a.leadEfficiency;
        case 'leadCount':
        default:
          return a.leadCount;
      }
    };
    const sorted = [...accounts].sort((a, b) => key(b) - key(a));
    return { traffic: sorted, efficiency: sorted, leadEfficiency: sorted };
  }

  /**
   * v1.3 OP-4 运营总览今日数据。
   * - todayPostCount / todayLeadCount / todayTraffic（按口径 likes+comments+favorites）
   * - 不返回 todayDeals（去除今日成交）
   * - 平台可选过滤
   */
  async getPersonalToday(
    employeeId: string,
    filters: { platform?: string; date?: string } = {},
  ): Promise<any> {
    const platform = this.normalizePlatform(filters.platform);
    const date = filters.date || todayString();
    const cacheKey = `dashboard:personal:today:${employeeId}:${platform || '_all'}:${date}`;
    const cached = this.cache.get<ReturnType<typeof this.computePersonalToday>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computePersonalToday(employeeId, platform, date);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computePersonalToday(employeeId: string, platform: string | null, date: string): Promise<any> {
    const postParams: any[] = [employeeId, date];
    const postWhere = ['p.employee_id = ?', 'p.published_at = ?'];
    if (platform) {
      postWhere.push('p.platform = ?');
      postParams.push(platform);
    }
    const leadParams: any[] = [employeeId, date];
    const leadWhere = ['l.employee_id = ?', 'DATE(l.created_at) = ?'];
    if (platform) {
      leadWhere.push('l.platform = ?');
      leadParams.push(platform);
    }

    const [postRow, leadRow] = await Promise.all([
      this.postRepo.query(
        `SELECT
           COUNT(*) AS post_count,
           COALESCE(SUM(p.likes), 0) AS likes,
           COALESCE(SUM(p.comments), 0) AS comments,
           COALESCE(SUM(p.favorites), 0) AS favorites
         FROM posts p WHERE ${postWhere.join(' AND ')}`,
        postParams,
      ),
      this.leadRepo.query(
        `SELECT COUNT(*) AS cnt FROM leads l WHERE ${leadWhere.join(' AND ')}`,
        leadParams,
      ),
    ]);
    const r = postRow[0] || {};
    const likes = Number(r.likes || 0);
    const comments = Number(r.comments || 0);
    const favorites = Number(r.favorites || 0);
    return {
      date,
      platform,
      todayPostCount: Number(r.post_count || 0),
      todayLeadCount: Number(leadRow[0]?.cnt || 0),
      todayTraffic: likes + comments + favorites,
    };
  }

  /**
   * v1.3 OP-18: 双平台分布（小红书 / 抖音）
   * 用于个人看板饼状图：作品占比 / 流量占比 / 获客占比。
   * - platform 参数缺省时返回两个平台，传入时仅返回该平台一行
   * - traffic = likes + comments + favorites
   * - leadCount 来自 leads 表（按 employeeId + platform 过滤）
   */
  async getPlatformDistribution(
    employeeId: string,
    range: { from?: string; to?: string; platform?: string } = {},
  ): Promise<{ platform: string; postCount: number; leadCount: number; traffic: number }[]> {
    const { from, to } = this.resolveRange(range);
    const platform = this.normalizePlatform(range.platform);
    const cacheKey = `dashboard:personal:platform-dist:${employeeId}:${from}:${to}:${platform || '_all'}`;
    const cached = this.cache.get<ReturnType<typeof this.computePlatformDistribution>>(cacheKey);
    if (cached !== undefined) return cached;
    const result = await this.computePlatformDistribution(employeeId, from, to, platform);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computePlatformDistribution(
    employeeId: string,
    from: string,
    to: string,
    platform: string | null,
  ): Promise<{ platform: string; postCount: number; leadCount: number; traffic: number }[]> {
    const platformList = platform ? [platform] : ['小红书', '抖音'];
    const result: { platform: string; postCount: number; leadCount: number; traffic: number }[] = [];
    for (const p of platformList) {
      const [postAgg, leadCount] = await Promise.all([
        this.postRepo.createQueryBuilder('p')
          .select('COUNT(*)', 'postCount')
          .addSelect('COALESCE(SUM(p.likes), 0)', 'likes')
          .addSelect('COALESCE(SUM(p.comments), 0)', 'comments')
          .addSelect('COALESCE(SUM(p.favorites), 0)', 'favorites')
          .where('p.employee_id = :employeeId', { employeeId })
          .andWhere('p.platform = :platform', { platform: p })
          .andWhere('p.published_at BETWEEN :from AND :to', { from, to })
          .getRawOne(),
        this.leadRepo.createQueryBuilder('l')
          .select('COUNT(*)', 'count')
          .where('l.employee_id = :employeeId', { employeeId })
          .andWhere('l.platform = :platform', { platform: p })
          .andWhere('DATE(l.created_at) BETWEEN :from AND :to', { from, to })
          .getRawOne(),
      ]);
      const postCount = Number(postAgg?.postCount || 0);
      const traffic = Number(postAgg?.likes || 0) + Number(postAgg?.comments || 0) + Number(postAgg?.favorites || 0);
      result.push({
        platform: p,
        postCount,
        leadCount: Number(leadCount?.count || 0),
        traffic,
      });
    }
    return result;
  }

  /**
   * v1.3 OP-19: 双平台作品量（每日/每周/每月）+ 流量 + 获客
   * - period=day → 按日聚合；period=week → 按 ISO 周聚合；period=month → 按月聚合
   * - 返回结构：{ period, points: [{date, xiaohongshuCount, douyinCount, xiaohongshuTraffic, douyinTraffic, xiaohongshuLeads, douyinLeads}] }
   */
  async getPlatformTrend(
    employeeId: string,
    options: { period?: string; from?: string; to?: string } = {},
  ): Promise<{ period: string; from: string; to: string; points: any[] }> {
    const period = this.normalizePeriod(options.period);
    const { from, to } = this.resolveRange(options);
    const cacheKey = `dashboard:personal:platform-trend:${employeeId}:${period}:${from}:${to}`;
    const cached = this.cache.get<{ period: string; from: string; to: string; points: any[] }>(cacheKey);
    if (cached !== undefined) return cached;
    const result = await this.computePlatformTrend(employeeId, period, from, to);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computePlatformTrend(
    employeeId: string,
    period: 'day' | 'week' | 'month',
    from: string,
    to: string,
  ): Promise<{ period: string; from: string; to: string; points: any[] }> {
    // 按 period 决定时间桶：day=YEAR(week, date)/YEAR(week, date), week=YEARWEEK, month=YEAR(week, date)/MONTH
    const dateExpr = period === 'day'
      ? "DATE_FORMAT(p.published_at, '%Y-%m-%d')"
      : period === 'week'
        ? "DATE_FORMAT(p.published_at, '%x-W%v')"
        : "DATE_FORMAT(p.published_at, '%Y-%m')";
    const leadDateExpr = period === 'day'
      ? "DATE_FORMAT(l.created_at, '%Y-%m-%d')"
      : period === 'week'
        ? "DATE_FORMAT(l.created_at, '%x-W%v')"
        : "DATE_FORMAT(l.created_at, '%Y-%m')";

    const [postRows, leadRows] = await Promise.all([
      this.postRepo.query(
        `SELECT ${dateExpr} AS bucket, p.platform AS platform,
                COUNT(*) AS post_count,
                COALESCE(SUM(p.likes), 0) AS likes,
                COALESCE(SUM(p.comments), 0) AS comments,
                COALESCE(SUM(p.favorites), 0) AS favorites
         FROM posts p
         WHERE p.employee_id = ? AND p.published_at BETWEEN ? AND ?
         GROUP BY bucket, p.platform`,
        [employeeId, from, to],
      ),
      this.leadRepo.query(
        `SELECT ${leadDateExpr} AS bucket, l.platform AS platform, COUNT(*) AS lead_count
         FROM leads l
         WHERE l.employee_id = ? AND DATE(l.created_at) BETWEEN ? AND ?
         GROUP BY bucket, l.platform`,
        [employeeId, from, to],
      ),
    ]);

    const buckets = new Set<string>();
    const map = new Map<string, { xiaohongshuCount: number; douyinCount: number; xiaohongshuTraffic: number; douyinTraffic: number; xiaohongshuLeads: number; douyinLeads: number }>();
    for (const r of postRows as any[]) {
      const b = String(r.bucket || '');
      if (!b) continue;
      buckets.add(b);
      const slot = map.get(b) || { xiaohongshuCount: 0, douyinCount: 0, xiaohongshuTraffic: 0, douyinTraffic: 0, xiaohongshuLeads: 0, douyinLeads: 0 };
      const likes = Number(r.likes || 0);
      const comments = Number(r.comments || 0);
      const favorites = Number(r.favorites || 0);
      const traffic = likes + comments + favorites;
      if (r.platform === '小红书') {
        slot.xiaohongshuCount += Number(r.post_count || 0);
        slot.xiaohongshuTraffic += traffic;
      } else if (r.platform === '抖音') {
        slot.douyinCount += Number(r.post_count || 0);
        slot.douyinTraffic += traffic;
      }
      map.set(b, slot);
    }
    for (const r of leadRows as any[]) {
      const b = String(r.bucket || '');
      if (!b) continue;
      buckets.add(b);
      const slot = map.get(b) || { xiaohongshuCount: 0, douyinCount: 0, xiaohongshuTraffic: 0, douyinTraffic: 0, xiaohongshuLeads: 0, douyinLeads: 0 };
      if (r.platform === '小红书') {
        slot.xiaohongshuLeads += Number(r.lead_count || 0);
      } else if (r.platform === '抖音') {
        slot.douyinLeads += Number(r.lead_count || 0);
      }
      map.set(b, slot);
    }

    const points = Array.from(buckets).sort().map((bucket) => ({
      date: bucket,
      ...(map.get(bucket) || { xiaohongshuCount: 0, douyinCount: 0, xiaohongshuTraffic: 0, douyinTraffic: 0, xiaohongshuLeads: 0, douyinLeads: 0 }),
    }));

    return { period, from, to, points };
  }

  /**
   * v1.3 OP-23: 账号时间序列（按日聚合），用于账号分析子菜单日历视图。
   * - days=30 默认，按日聚合
   * - 返回结构：{ account: {id, accountName, platform, postingPlan}, from, to, days: [{date, postCount, leadCount, traffic, posts: [...]}] }
   * - 颜色编码见前端：橙=当日有 is_lead_post=1 且关联 leads>=1；绿=有帖但无高获客；灰=未发
   * - 这里用 post_type IN ('获客贴','营销贴') 作为 is_lead_post 替代字段
   */
  async getAccountTimeSeries(
    accountId: string,
    options: { days?: number; from?: string; to?: string } = {},
  ): Promise<any> {
    const days = Math.max(1, Math.min(Number(options.days) || 30, 90));
    const today = todayString();
    const todayDate = new Date(today);
    const fromDate = new Date(todayDate);
    fromDate.setDate(todayDate.getDate() - days + 1);
    const from = options.from || fromDate.toISOString().slice(0, 10);
    const to = options.to || today;

    const cacheKey = `dashboard:account-timeseries:${accountId}:${from}:${to}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached !== undefined) return cached;
    const result = await this.computeAccountTimeSeries(accountId, from, to);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  /**
   * v1.3 OP-23 扩展：员工名下全部账号的时间序列（各账号独立）。
   * - 返回每个账号各自的 timeSeries 数据，前端各账号分别渲染日历视图
   * - 返回结构：{ accounts: [...], items: [{ account, from, to, days, summary }, ...], from, to }
   */
  async getAllAccountsTimeSeries(
    employeeId: string,
    options: { days?: number; from?: string; to?: string; platform?: string; sort?: string } = {},
  ): Promise<any> {
    if (!employeeId) {
      return { accounts: [], items: [], from: '', to: '' };
    }

    const days = Math.max(1, Math.min(Number(options.days) || 30, 90));
    const today = todayString();
    const todayDate = new Date(today);
    const fromDate = new Date(todayDate);
    fromDate.setDate(todayDate.getDate() - days + 1);
    const from = options.from || fromDate.toISOString().slice(0, 10);
    const to = options.to || today;
    const platform = this.normalizePlatform(options.platform) || undefined;

    const cacheKey = `dashboard:all-accounts-timeseries:${employeeId}:${platform || ''}:${from}:${to}:${options.sort || 'leadCount'}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached !== undefined) return cached;
    const result = await this.computeAllAccountsTimeSeries(employeeId, from, to, platform, options.sort);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computeAllAccountsTimeSeries(
    employeeId: string,
    from: string,
    to: string,
    platform?: string,
    sort?: string,
  ): Promise<any> {
    const accountWhere = platform ? 'AND a.platform = ?' : '';
    const accountParams: any[] = platform
      ? [from, to, from, to, employeeId, platform]
      : [from, to, from, to, employeeId];
    const accountRows: any = await this.accountRepo.query(
      `SELECT a.id, a.account_name AS accountName, a.platform, a.posting_plan AS postingPlan,
              a.persona, a.positioning,
              COALESCE(p_agg.has_recent_posts, 0) AS has_recent_posts,
              COALESCE(p_agg.post_count, 0) AS post_count,
              COALESCE(p_agg.total_traffic, 0) AS total_traffic,
              COALESCE(l_agg.total_leads, 0) AS total_leads
         FROM accounts a
         LEFT JOIN (
           SELECT account_id,
                  COUNT(*) AS post_count,
                  (CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END) AS has_recent_posts,
                  COALESCE(SUM(likes + comments + favorites), 0) AS total_traffic
             FROM posts
            WHERE published_at BETWEEN ? AND ?
            GROUP BY account_id
         ) p_agg ON p_agg.account_id COLLATE utf8mb4_unicode_ci = a.id COLLATE utf8mb4_unicode_ci
         LEFT JOIN (
           SELECT account_id, COUNT(*) AS total_leads
             FROM leads
            WHERE created_at BETWEEN ? AND ?
            GROUP BY account_id
         ) l_agg ON l_agg.account_id COLLATE utf8mb4_unicode_ci = a.id COLLATE utf8mb4_unicode_ci
        WHERE a.employee_id = ? ${accountWhere}`,
      accountParams,
    );
    const accounts: any[] = Array.isArray(accountRows) ? accountRows : [];
    this.applyAccountSort(accounts, sort);

    if (accounts.length === 0) {
      return { accounts: [], items: [], from, to };
    }

    // 对每个账号单独计算时间序列
    const items = await Promise.all(
      accounts.map((a) => this.computeAccountTimeSeries(a.id, from, to)),
    );

    return { accounts, items, from, to };
  }

  /**
   * 对账号数组原地排序。sort 不识别或为 'default' 时按「作品数/获客数降序」
   * (leadCount DESC, postCount DESC)，与 sort='leadCount' 行为一致。
   * - leadCount     : total_leads DESC, post_count DESC
   * - postCount     : post_count DESC, total_leads DESC
   * - traffic       : total_traffic DESC, total_leads DESC
   * - default       : leadCount DESC, postCount DESC
   */
  private applyAccountSort(accounts: any[], sort?: string): void {
    const num = (v: unknown) => Number(v || 0);
    const key = (a: any): number => {
      switch (sort) {
        case 'postCount':
          return num(a.post_count);
        case 'traffic':
          return num(a.total_traffic);
        case 'leadCount':
        case 'default':
        default:
          return num(a.total_leads);
      }
    };
    accounts.sort((a, b) => {
      const diff = key(b) - key(a);
      if (diff !== 0) return diff;
      // 相同主键时按次级键降序（leadCount/postCount/traffic 互为次级）
      const secondary = (sort === 'postCount') ? num(b.total_leads) - num(a.total_leads)
        : (sort === 'traffic') ? num(b.total_leads) - num(a.total_leads)
        : num(b.post_count) - num(a.post_count);
      if (secondary !== 0) return secondary;
      // 再相同按账号名升序兜底
      return String(a.accountName || '').localeCompare(String(b.accountName || ''));
    });
  }

  private async computeAccountTimeSeries(accountId: string, from: string, to: string): Promise<any> {
    const [account, postRows, leadRows] = await Promise.all([
      this.accountRepo.findOne({ where: { id: accountId } as any }),
      this.postRepo.query(
        // DATE_FORMAT 强制返回 'YYYY-MM-DD' 字符串，避免 mysql2 把 DATETIME/DATE 转成 JS Date 后
        // String(date).slice(0,10) 拿到 "Tue Apr 28" 这种星期前缀，导致与 daysMap 的 'YYYY-MM-DD' key 不匹配。
        `SELECT p.id AS id, DATE_FORMAT(p.published_at, '%Y-%m-%d') AS date,
                p.title AS title, p.platform AS platform,
                p.post_type AS post_type, p.likes AS likes, p.comments AS comments, p.favorites AS favorites, p.traffic AS traffic,
                (SELECT COUNT(*) FROM leads l WHERE l.post_id = p.id) AS lead_count
         FROM posts p
         WHERE p.account_id = ? AND p.published_at BETWEEN ? AND ?
         ORDER BY p.published_at ASC`,
        [accountId, from, to],
      ),
      this.leadRepo.query(
        `SELECT DATE_FORMAT(l.created_at, '%Y-%m-%d') AS date,
                l.post_id AS post_id, COUNT(*) AS lead_count
         FROM leads l
         WHERE l.account_id = ? AND l.created_at BETWEEN ? AND ?
         GROUP BY DATE_FORMAT(l.created_at, '%Y-%m-%d'), l.post_id`,
        [accountId, from, to],
      ),
    ]);

    // 按日聚合 + 按日 posts 列表
    const daysMap = new Map<string, { date: string; postCount: number; leadCount: number; traffic: number; posts: any[] }>();
    const allDates = this.dailyDateRange(from, to);
    for (const d of allDates) {
      daysMap.set(d, { date: d, postCount: 0, leadCount: 0, traffic: 0, posts: [] });
    }
    // posts 按 lead_count 已 select 出来
    for (const r of postRows as any[]) {
      const day = String(r.date || '').slice(0, 10);
      if (!day || !daysMap.has(day)) continue;
      const bucket = daysMap.get(day)!;
      const leadCount = Number(r.lead_count || 0);
      const traffic = Number(r.likes || 0) + Number(r.comments || 0) + Number(r.favorites || 0);
      const isLeadPost = ['获客贴', '营销贴'].includes(r.post_type);
      bucket.postCount += 1;
      bucket.leadCount += leadCount;
      bucket.traffic += traffic;
      bucket.posts.push({
        postId: r.id,
        title: r.title,
        platform: r.platform || '',
        type: normalizePostType(r.post_type),
        isLead: isLeadPost,
        leadCount,
        traffic,
      });
    }
    // leads 没有 post_id 时按日累加（无对应 post 的客资也归到当日 leadCount）
    for (const r of leadRows as any[]) {
      const day = String(r.date || '').slice(0, 10);
      if (!day || !daysMap.has(day)) continue;
      const postId = r.post_id;
      const slot = daysMap.get(day)!;
      // 若 lead 已经有对应 post 计入过 leadCount, 这里跳过避免重复
      if (postId) continue;
      slot.leadCount += Number(r.lead_count || 0);
    }

    return {
      account: {
        id: accountId,
        accountName: account?.accountName || accountId,
        platform: account?.platform || '',
        postingPlan: account?.postingPlan || '',
        persona: account?.persona || '',
        positioning: account?.positioning || '',
      },
      from,
      to,
      days: Array.from(daysMap.values()),
      summary: this.summarizeAccountTimeSeries(Array.from(daysMap.values())),
    };
  }

  private summarizeAccountTimeSeries(days: any[]): any {
    let postCount = 0;
    let leadCount = 0;
    let traffic = 0;
    let highLeadDays = 0;
    let lowLeadDays = 0;
    let noPostDays = 0;
    for (const d of days) {
      postCount += d.postCount;
      leadCount += d.leadCount;
      traffic += d.traffic;
      if (d.postCount === 0) noPostDays += 1;
      else if (d.posts.some((p: any) => p.isLead && p.leadCount > 0)) highLeadDays += 1;
      else lowLeadDays += 1;
    }
    return { postCount, leadCount, traffic, highLeadDays, lowLeadDays, noPostDays };
  }

  private dailyDateRange(from: string, to: string): string[] {
    const out: string[] = [];
    const start = new Date(from);
    const end = new Date(to);
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }

  private normalizePeriod(input?: string): 'day' | 'week' | 'month' {
    const raw = String(input || '').trim().toLowerCase();
    if (raw === 'week' || raw === 'weekly') return 'week';
    if (raw === 'month' || raw === 'monthly') return 'month';
    return 'day';
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
        date: formatDateOnly(row.date),
        platform: row.platform,
        postCount: Number(row.post_count || 0),
        likes: Number(row.likes || 0),
      })),
      postStructure: postStructure.map((row: any) => ({
        type: normalizePostType(row.type),
        count: Number(row.count || 0),
      })),
      leadTrend: leadTrend.map((row: any) => ({
        date: formatDateOnly(row.date),
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
    if (raw === 'xhs' || raw === 'xiaohongshu' || raw === '小红书') return '小红书';
    if (raw === 'dy' || raw === 'douyin' || raw === '抖音') return '抖音';
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
