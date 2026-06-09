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
  /**
   * v1.3 OP-18 / T3.1 / T3.2 个人看板双平台分布
   * 返回每平台聚合：作品 / 流量 / 客资 / 获客贴数 / 客资按平台分布；
   * 新增字段（v1.3 T3 修复）：
   *   - leadPostCount   获客贴数（post_type IN ('获客贴','营销贴','人设贴/讨论贴/获客贴')），
   *                     注意：原代码口径已包含历史值 营销贴，这里扩展为：当前 3 大类型合并
   *   - leadEfficiency  客资数 / 获客贴数（T3.2 单位 客/作）
   *   - postTypes       三类作品分类（人设贴 / 讨论贴 / 获客贴），T3.1 饼图数据源
   *                     字段值采用前端约定命名（人设贴=素人贴的别名, 讨论贴=话题贴的别名），
   *                     与 schema 注释一致，避免前端再次做 normalize。
   */
  async getPlatformDistribution(
    employeeId: string,
    range: { from?: string; to?: string; platform?: string } = {},
  ): Promise<{
    platform: string;
    postCount: number;
    leadCount: number;
    traffic: number;
    leadPostCount: number;
    leadEfficiency: number;
    /** 三类作品分类（人设贴/讨论贴/获客贴）— 数量求和 = postCount */
    postTypes: { type: string; count: number }[];
  }[]> {
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
  ): Promise<{
    platform: string;
    postCount: number;
    leadCount: number;
    traffic: number;
    leadPostCount: number;
    leadEfficiency: number;
    postTypes: { type: string; count: number }[];
  }[]> {
    const platformList = platform ? [platform] : ['小红书', '抖音'];
    const result: {
      platform: string;
      postCount: number;
      leadCount: number;
      traffic: number;
      leadPostCount: number;
      leadEfficiency: number;
      postTypes: { type: string; count: number }[];
    }[] = [];
    for (const p of platformList) {
      // T3.1: 一次性取 3 类作品分类 + 获客贴总数；原 SQL 保留兼容性（leadPostCount 仍用 IN 列表口径）
      const postBaseWhere = 'p.employee_id = ? AND p.platform = ? AND p.published_at BETWEEN ? AND ?';
      const [postAgg, leadCount, postTypeRows] = await Promise.all([
        this.postRepo.query(
          `SELECT
             COUNT(*) AS post_count,
             COALESCE(SUM(p.likes), 0) AS likes,
             COALESCE(SUM(p.comments), 0) AS comments,
             COALESCE(SUM(p.favorites), 0) AS favorites,
             COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴','营销贴') THEN 1 ELSE 0 END), 0) AS lead_post_count
           FROM posts p WHERE ${postBaseWhere}`,
          [employeeId, p, from, to],
        ),
        this.leadRepo.query(
          `SELECT COUNT(*) AS cnt FROM leads l
           WHERE l.employee_id = ? AND l.platform = ? AND DATE(l.created_at) BETWEEN ? AND ?`,
          [employeeId, p, from, to],
        ),
        // T3.1: 三类作品分类（人设贴/讨论贴/获客贴）。历史值映射：
        //   人设贴 ↔ 素人贴；讨论帖 ↔ 话题贴；获客贴（含历史 营销贴）
        // 使用 CASE 直接归类，避免 GROUP BY 中重复多值
        this.postRepo.query(
          `SELECT
             CASE
               WHEN p.post_type IN ('人设贴','素人贴') THEN '人设贴'
               WHEN p.post_type IN ('讨论帖','讨论贴','话题贴') THEN '讨论贴'
               WHEN p.post_type IN ('获客贴','营销贴') THEN '获客贴'
               ELSE '其他'
             END AS type_alias,
             COUNT(*) AS cnt
           FROM posts p WHERE ${postBaseWhere}
           GROUP BY type_alias`,
          [employeeId, p, from, to],
        ),
      ]);
      const r = (postAgg as any[])[0] || {};
      const postCount = Number(r.post_count || 0);
      const leadPostCount = Number(r.lead_post_count || 0);
      const traffic = Number(r.likes || 0) + Number(r.comments || 0) + Number(r.favorites || 0);
      const lc = Number((leadCount as any[])[0]?.cnt || 0);
      const leadEfficiency = leadPostCount > 0 ? Number((lc / leadPostCount).toFixed(2)) : 0;

      // 组装三类作品分类：保证 3 项齐全（即使 0）
      const typeMap = new Map<string, number>();
      for (const row of postTypeRows as any[]) {
        const t = String(row.type_alias || '');
        if (t === '其他') continue;
        typeMap.set(t, Number(row.cnt || 0));
      }
      const postTypes = [
        { type: '人设贴', count: typeMap.get('人设贴') || 0 },
        { type: '讨论贴', count: typeMap.get('讨论贴') || 0 },
        { type: '获客贴', count: typeMap.get('获客贴') || 0 },
      ];

      result.push({
        platform: p,
        postCount,
        leadCount: lc,
        traffic,
        leadPostCount,
        leadEfficiency,
        postTypes,
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
   * @param period today / week / month（快捷周期）
   * @param from 自定义开始日期（YYYY-MM-DD），非空时覆盖 period 推算
   * @param to   自定义结束日期（YYYY-MM-DD），非空时覆盖 period 推算
   */
  async getSupervisorOverview(period: string = 'today', from?: string, to?: string): Promise<any> {
    const range = from && to ? { from, to } : this.resolvePeriod(period);
    const cacheKey = `dashboard:supervisor:overview:${period || 'custom'}:${range.from}:${range.to}`;
    const cached = this.cache.get<ReturnType<typeof this.computeSupervisorOverview>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computeSupervisorOverview(range.from, range.to, period);
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
   * 主管总览扩展（T1.3 任务清单）：在 4 张概览卡之外补齐 7 个新区域数据。
   *
   *   1. platformDistribution       双平台分布（小红书 / 抖音，作品 / 客资 / 流量 3 维）
   *   2. postVolumeTrend            作品量趋势（按日 / 周 / 月聚合；与 platformDistribution 共享数据源）
   *   3. postTypeDistribution       三类作品占比（人设贴 / 讨论贴 / 获客帖 → 业务口径归一）
   *   4. leadTrend                  获客趋势（小红书 / 抖音 / 总和 三条曲线，按 period 聚合）
   *   5. trafficTrend               流量趋势（小红书 / 抖音 / 总和 三条曲线，按 period 聚合）
   *   6. leadEfficiency             获客效率（客资数 / 作品数，按平台）
   *   7. leadPostEfficiency         获客帖效率（客资数 / 获客帖数，按平台）
   *
   * 设计要点：
   *   - 完全复用 computeSupervisorOverview 解析出的 from/to 区间，不影响现有 4 卡
   *   - 三类作品占比：业务字面要求 `type IN ('人设贴','讨论贴','获客帖')`；为兼容历史值
   *     （人设贴/讨论帖/营销贴）以及当前值（素人贴/话题贴/获客贴），使用 IN 子句同时包含
   *     这 6 个值，再用 normalizePostType 在应用层归一为 素人贴/话题贴/获客贴（即"人设贴/讨论贴/获客帖"业务同义）
   *   - 缓存键与 supervisor overview 一致，但加上 :extended 命名空间隔离
   *   - period=day/week/month 仅决定趋势图的时间桶，4 张数据卡始终走 from/to
   */
  async getSupervisorExtended(
    period: string = 'today',
    from?: string,
    to?: string,
    trendPeriod: 'day' | 'week' | 'month' = 'day',
  ): Promise<any> {
    const range = from && to ? { from, to } : this.resolvePeriod(period);
    const trendKey = this.normalizePeriod(trendPeriod);
    const cacheKey = `dashboard:supervisor:extended:${period || 'custom'}:${range.from}:${range.to}:${trendKey}`;
    const cached = this.cache.get<ReturnType<typeof this.computeSupervisorExtended>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computeSupervisorExtended(range.from, range.to, trendKey);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  private async computeSupervisorExtended(
    from: string,
    to: string,
    trendPeriod: 'day' | 'week' | 'month',
  ): Promise<any> {
    // IN 列表覆盖业务字面三值 + 历史同义值 + 当前值（normalizePostType 统一归一为 素人贴/话题贴/获客贴）
    const postTypeAliases = ['人设贴', '讨论贴', '获客帖', '素人贴', '话题贴', '获客贴', '营销贴', '讨论帖', 'note', 'video'];
    const aliasPlaceholders = postTypeAliases.map(() => '?').join(',');

    // 1) 平台分布（小红书 / 抖音）—— 作品数 / 客资数 / 流量
    // 2) 三类作品占比（业务归一后）
    // 5) 流量趋势（按 period 聚合）
    // 4) 获客趋势（按 period 聚合）
    // 6) 获客效率（聚合后计算）
    // 7) 获客帖效率（聚合后计算）
    // 3) 作品量趋势（按 period 聚合）—— 与 4 共享 lead bucket
    const dateExpr = trendPeriod === 'day'
      ? "DATE_FORMAT(p.published_at, '%Y-%m-%d')"
      : trendPeriod === 'week'
        ? "DATE_FORMAT(p.published_at, '%x-W%v')"
        : "DATE_FORMAT(p.published_at, '%Y-%m')";
    const leadDateExpr = trendPeriod === 'day'
      ? "DATE_FORMAT(l.created_at, '%Y-%m-%d')"
      : trendPeriod === 'week'
        ? "DATE_FORMAT(l.created_at, '%x-W%v')"
        : "DATE_FORMAT(l.created_at, '%Y-%m')";

    const [platformAgg, postTypeRows, leadEfficiencyRows, postTrendRows, leadTrendRows] = await Promise.all([
      // 1) 平台分布：单次聚合两个平台的三项指标
      this.postRepo.query(
        `SELECT p.platform AS platform,
                COUNT(*) AS post_count,
                COALESCE(SUM(p.likes), 0) AS likes,
                COALESCE(SUM(p.comments), 0) AS comments,
                COALESCE(SUM(p.favorites), 0) AS favorites
         FROM posts p
         WHERE p.published_at BETWEEN ? AND ?
         GROUP BY p.platform`,
        [from, to],
      ),
      // 2) 三类作品占比：先按字面 GROUP BY，再用 normalizePostType 归一
      this.postRepo.query(
        `SELECT post_type, COUNT(*) AS count
         FROM posts
         WHERE published_at BETWEEN ? AND ? AND post_type IN (${aliasPlaceholders})
         GROUP BY post_type`,
        [from, to, ...postTypeAliases],
      ),
      // 6) 7) 效率：每平台的作品数 / 客资数 / 获客帖数 一次拿全
      this.postRepo.query(
        `SELECT p.platform AS platform,
                COUNT(*) AS post_count,
                COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴','获客帖','营销贴') THEN 1 ELSE 0 END), 0) AS lead_post_count
         FROM posts p
         WHERE p.published_at BETWEEN ? AND ?
         GROUP BY p.platform`,
        [from, to],
      ),
      // 5) 流量趋势：每桶每平台 likes+comments+favorites
      this.postRepo.query(
        `SELECT ${dateExpr} AS bucket, p.platform AS platform,
                COALESCE(SUM(p.likes), 0) AS likes,
                COALESCE(SUM(p.comments), 0) AS comments,
                COALESCE(SUM(p.favorites), 0) AS favorites
         FROM posts p
         WHERE p.published_at BETWEEN ? AND ?
         GROUP BY bucket, p.platform`,
        [from, to],
      ),
      // 4) 获客趋势：每桶每平台 lead_count
      this.leadRepo.query(
        `SELECT ${leadDateExpr} AS bucket, l.platform AS platform, COUNT(*) AS lead_count
         FROM leads l
         WHERE DATE(l.created_at) BETWEEN ? AND ?
         GROUP BY bucket, l.platform`,
        [from, to],
      ),
    ]);

    // 平台分布结果：组装为 [{platform, postCount, leadCount, traffic}]
    // leads 也要按 platform 聚合，与 postUnion 后拼装
    const leadByPlatformRows = await this.leadRepo.query(
      `SELECT platform, COUNT(*) AS lead_count
       FROM leads
       WHERE DATE(created_at) BETWEEN ? AND ?
       GROUP BY platform`,
      [from, to],
    );
    // W4 修复：leadByPlatform key 需经过 normalizePlatform 归一化，
    // 否则 DB 中 platform='douyin' 的行不会被 '抖音' key 匹配到
    const leadByPlatform = new Map<string, number>();
    for (const r of leadByPlatformRows as any[]) {
      const normalized = this.normalizePlatform(String(r.platform || ''));
      if (normalized) {
        leadByPlatform.set(normalized, (leadByPlatform.get(normalized) || 0) + Number(r.lead_count || 0));
      }
    }
    const platformDistribution: { platform: string; postCount: number; leadCount: number; traffic: number }[] = [];
    for (const p of ['小红书', '抖音']) {
      // 兼容历史平台值：xhs / xiaohongshu / 小红书 ；douyin / 抖音
      let postCount = 0;
      let traffic = 0;
      for (const r of platformAgg as any[]) {
        if (this.normalizePlatform(r.platform) === p) {
          postCount += Number(r.post_count || 0);
          traffic += Number(r.likes || 0) + Number(r.comments || 0) + Number(r.favorites || 0);
        }
      }
      platformDistribution.push({
        platform: p,
        postCount,
        traffic,
        leadCount: leadByPlatform.get(p) || 0,
      });
    }

    // 三类作品占比：归一 + 求百分比
    const postTypeBuckets: Record<string, number> = { 素人贴: 0, 话题贴: 0, 获客贴: 0 };
    for (const r of postTypeRows as any[]) {
      const t = normalizePostType(r.post_type);
      postTypeBuckets[t] = (postTypeBuckets[t] || 0) + Number(r.count || 0);
    }
    const postTypeTotal = postTypeBuckets.素人贴 + postTypeBuckets.话题贴 + postTypeBuckets.获客贴;
    const postTypeDistribution: Array<{ type: string; count: number; ratio: string }> = (['素人贴', '话题贴', '获客贴'] as const).map((type) => {
      const count = postTypeBuckets[type] || 0;
      const ratio = postTypeTotal > 0 ? `${Math.round((count / postTypeTotal) * 100)}%` : '0%';
      // 业务对外展示用"人设贴/讨论贴/获客帖"三标签（业务字面要求）
      const display = type === '素人贴' ? '人设贴' : type === '话题贴' ? '讨论贴' : '获客帖';
      return { type: display, count, ratio };
    });

    // 获客效率 / 获客帖效率（每平台 + 总计）
    const leadEfficiencyByPlatform: Record<string, { postCount: number; leadPostCount: number; leadCount: number }> = {
      '小红书': { postCount: 0, leadPostCount: 0, leadCount: 0 },
      '抖音': { postCount: 0, leadPostCount: 0, leadCount: 0 },
    };
    for (const r of leadEfficiencyRows as any[]) {
      const p = this.normalizePlatform(r.platform);
      if (!p) continue;
      const slot = leadEfficiencyByPlatform[p];
      if (!slot) continue;
      slot.postCount += Number(r.post_count || 0);
      slot.leadPostCount += Number(r.lead_post_count || 0);
    }
    for (const p of ['小红书', '抖音'] as const) {
      leadEfficiencyByPlatform[p].leadCount = leadByPlatform.get(p) || 0;
    }
    const leadEfficiency = this.computeEfficiencyTriplet(leadEfficiencyByPlatform);

    // 趋势数据：合并 posts 流量 + leads 客资，按 bucket 对齐；每桶汇总三条曲线
    const trendMap = new Map<string, { xhs: number; douyin: number; xhsLeads: number; douyinLeads: number; xhsTraffic: number; douyinTraffic: number; xhsPosts: number; douyinPosts: number }>();
    const ensureSlot = (bucket: string) => {
      let slot = trendMap.get(bucket);
      if (!slot) {
        slot = { xhs: 0, douyin: 0, xhsLeads: 0, douyinLeads: 0, xhsTraffic: 0, douyinTraffic: 0, xhsPosts: 0, douyinPosts: 0 };
        trendMap.set(bucket, slot);
      }
      return slot;
    };
    for (const r of postTrendRows as any[]) {
      const bucket = String(r.bucket || '');
      if (!bucket) continue;
      const p = this.normalizePlatform(r.platform);
      const traffic = Number(r.likes || 0) + Number(r.comments || 0) + Number(r.favorites || 0);
      const slot = ensureSlot(bucket);
      if (p === '小红书') {
        slot.xhsTraffic += traffic;
        // 作品量趋势（同时累计 posts 计数）
        slot.xhsPosts += Number(0); // 占位，下面用 leadTrend bucket 内补
      } else if (p === '抖音') {
        slot.douyinTraffic += traffic;
      }
    }
    // 作品量需要单独查一次（postTrend 上面只 SELECT 了 likes/comments/favorites）
    // 简化：再跑一遍 SELECT COUNT + 平台 与 bucket 聚合
    const postCountTrendRows = await this.postRepo.query(
      `SELECT ${dateExpr} AS bucket, p.platform AS platform, COUNT(*) AS post_count
       FROM posts p
       WHERE p.published_at BETWEEN ? AND ?
       GROUP BY bucket, p.platform`,
      [from, to],
    );
    for (const r of postCountTrendRows as any[]) {
      const bucket = String(r.bucket || '');
      if (!bucket) continue;
      const p = this.normalizePlatform(r.platform);
      const slot = ensureSlot(bucket);
      if (p === '小红书') slot.xhsPosts += Number(r.post_count || 0);
      else if (p === '抖音') slot.douyinPosts += Number(r.post_count || 0);
    }
    for (const r of leadTrendRows as any[]) {
      const bucket = String(r.bucket || '');
      if (!bucket) continue;
      const p = this.normalizePlatform(r.platform);
      const slot = ensureSlot(bucket);
      if (p === '小红书') slot.xhsLeads += Number(r.lead_count || 0);
      else if (p === '抖音') slot.douyinLeads += Number(r.lead_count || 0);
    }
    const postVolumeTrend = Array.from(trendMap.keys()).sort().map((bucket) => {
      const s = trendMap.get(bucket)!;
      return {
        date: bucket,
        xiaohongshuCount: s.xhsPosts,
        douyinCount: s.douyinPosts,
      };
    });
    const leadTrend = Array.from(trendMap.keys()).sort().map((bucket) => {
      const s = trendMap.get(bucket)!;
      return {
        date: bucket,
        xiaohongshuLeads: s.xhsLeads,
        douyinLeads: s.douyinLeads,
      };
    });
    const trafficTrend = Array.from(trendMap.keys()).sort().map((bucket) => {
      const s = trendMap.get(bucket)!;
      return {
        date: bucket,
        xiaohongshuTraffic: s.xhsTraffic,
        douyinTraffic: s.douyinTraffic,
      };
    });

    return {
      period: { from, to, trendPeriod },
      platformDistribution,           // 1
      postVolumeTrend,                // 2
      postTypeDistribution,           // 3
      leadTrend,                      // 4
      trafficTrend,                   // 5
      leadEfficiency,                 // 6
      leadPostEfficiency: this.computeLeadPostEfficiencyTriplet(leadEfficiencyByPlatform, leadEfficiency), // 7
    };
  }

  /**
   * 把 leadEfficiencyByPlatform（每平台的作品数/获客帖数/客资数）组装为：
   *   {
   *     xiaohongshu: number, douyin: number, total: number
   *   }
   * 效率 = 客资数 / 作品数；分母为 0 时返回 0。
   */
  private computeEfficiencyTriplet(agg: Record<string, { postCount: number; leadPostCount: number; leadCount: number }>): {
    xiaohongshu: number;
    douyin: number;
    total: number;
  } {
    const xs = agg['小红书'] || { postCount: 0, leadCount: 0 };
    const dy = agg['抖音'] || { postCount: 0, leadCount: 0 };
    const totalPost = xs.postCount + dy.postCount;
    const totalLead = xs.leadCount + dy.leadCount;
    return {
      xiaohongshu: xs.postCount > 0 ? Number((xs.leadCount / xs.postCount).toFixed(2)) : 0,
      douyin: dy.postCount > 0 ? Number((dy.leadCount / dy.postCount).toFixed(2)) : 0,
      total: totalPost > 0 ? Number((totalLead / totalPost).toFixed(2)) : 0,
    };
  }

  /**
   * 获客帖效率 = 客资数 / 获客帖数。
   * 复用同一份 per-platform 聚合结果，避免重复 SQL。
   */
  private computeLeadPostEfficiencyTriplet(agg: Record<string, { postCount: number; leadPostCount: number; leadCount: number }>, _leadEff: { xiaohongshu: number; douyin: number; total: number }): {
    xiaohongshu: number;
    douyin: number;
    total: number;
  } {
    const xs = agg['小红书'] || { postCount: 0, leadPostCount: 0, leadCount: 0 };
    const dy = agg['抖音'] || { postCount: 0, leadPostCount: 0, leadCount: 0 };
    const totalLeadPost = xs.leadPostCount + dy.leadPostCount;
    const totalLead = xs.leadCount + dy.leadCount;
    return {
      xiaohongshu: xs.leadPostCount > 0 ? Number((xs.leadCount / xs.leadPostCount).toFixed(2)) : 0,
      douyin: dy.leadPostCount > 0 ? Number((dy.leadCount / dy.leadPostCount).toFixed(2)) : 0,
      total: totalLeadPost > 0 ? Number((totalLead / totalLeadPost).toFixed(2)) : 0,
    };
  }

  /**
   * T6.1/T6.2/T6.3/T6.4 主管分析看板聚合。
   *
   * 过滤维度：
   *   - platform      '小红书' | '抖音' | ''（空=全部）
   *   - employeeId    员工 ID（空=全部员工）
   *   - accountId     账号 ID（空=全部账号；T6.2 单账号维度）
   *   - from / to     日期区间（T6.2 时段筛选；缺省=本月第一天~今天）
   *
   * 8 类指标：
   *   - platformTrend         每平台每日作品数 + 点赞数
   *   - postStructure         作品类型占比（人设贴/讨论贴/获客帖）
   *   - leadTrend             每平台每日客资数
   *   - trafficTrend          每平台每日流量（T6.3：likes+comments+favorites）
   *   - efficiencyTrend       每平台每日获客效率（客资/作）（T6.3）
   *   - leadEfficiencyTrend   每平台每日获客帖效率（客资/获客贴）（T6.3）
   *   - efficiencyRatio       按员工聚合：客资/作（T6.4）
   *   - leadPostRatio         按员工聚合：客资/获客贴（T6.4）
   *
   * 5 分钟进程内缓存；key 含 5 个过滤维度。
   */
  async getSupervisorAnalysis(
    filters: { platform?: string; employeeId?: string; accountId?: string; from?: string; to?: string } = {},
  ): Promise<any> {
    const platform = this.normalizePlatform(filters.platform);
    const platformKey = platform || '_all';
    const employeeIdKey = filters.employeeId || '_all';
    const accountIdKey = filters.accountId || '_all';
    const { from, to } = this.resolveAnalysisRange(filters);
    const cacheKey = `dashboard:supervisor:analysis:${platformKey}:${employeeIdKey}:${accountIdKey}:${from}:${to}`;
    const cached = this.cache.get<ReturnType<typeof this.computeSupervisorAnalysis>>(cacheKey);
    if (cached !== undefined) return cached;

    const result = await this.computeSupervisorAnalysis(platform, filters.employeeId, filters.accountId, from, to);
    this.cache.set(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  /**
   * 分析看板时段解析：与主管端 dashboard.getSupervisorOverview 同口径。
   * 不传 from/to → 本月第一天 ~ 今天；仅传一端 → 缺省端用今天。
   */
  private resolveAnalysisRange(filters: { from?: string; to?: string }): { from: string; to: string } {
    const today = todayString();
    const firstDay = (() => {
      const now = new Date(today);
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    })();
    return {
      from: filters.from || firstDay,
      to: filters.to || today,
    };
  }

  private async computeSupervisorAnalysis(
    platform: string | null,
    employeeId: string | undefined,
    accountId: string | undefined,
    from: string,
    to: string,
  ): Promise<any> {
    // 公共 WHERE 片段：post 表 & lead 表同时使用平台/员工/账号 + 日期过滤
    const postWhere: string[] = ['p.published_at BETWEEN ? AND ?'];
    const postParams: any[] = [from, to];
    const leadWhere: string[] = ['DATE(l.created_at) BETWEEN ? AND ?'];
    const leadParams: any[] = [from, to];
    if (platform) {
      postWhere.push('p.platform = ?');
      postParams.push(platform);
      leadWhere.push('l.platform = ?');
      leadParams.push(platform);
    }
    if (employeeId) {
      postWhere.push('p.employee_id = ?');
      postParams.push(employeeId);
      leadWhere.push('l.employee_id = ?');
      leadParams.push(employeeId);
    }
    if (accountId) {
      postWhere.push('p.account_id = ?');
      postParams.push(accountId);
      leadWhere.push('l.account_id = ?');
      leadParams.push(accountId);
    }
    const postWhereSql = postWhere.join(' AND ');
    const leadWhereSql = leadWhere.join(' AND ');

    const [platformTrend, postStructure, leadTrend, trafficTrend, efficiencyByDay, leadEfficiencyByDay, efficiencyByEmployee, leadEfficiencyByEmployee] =
      await Promise.all([
        // 1. 平台趋势：每平台每日作品数 + 点赞
        this.postRepo.query(
          `SELECT DATE_FORMAT(p.published_at, '%Y-%m-%d') AS date, p.platform AS platform, COUNT(*) AS post_count, COALESCE(SUM(p.likes), 0) AS likes
           FROM posts p
           WHERE ${postWhereSql}
           GROUP BY date, p.platform
           ORDER BY date ASC`,
          postParams,
        ),
        // 2. 作品结构：人设贴/讨论贴/获客帖
        this.postRepo.query(
          `SELECT p.post_type AS type, COUNT(*) AS count
           FROM posts p
           WHERE ${postWhereSql}
           GROUP BY p.post_type`,
          postParams,
        ),
        // 3. 客资趋势：每平台每日客资数
        this.leadRepo.query(
          `SELECT DATE_FORMAT(DATE(l.created_at), '%Y-%m-%d') AS date, l.platform AS platform, COUNT(*) AS lead_count
           FROM leads l
           WHERE ${leadWhereSql}
           GROUP BY date, l.platform
           ORDER BY date ASC`,
          leadParams,
        ),
        // 4. T6.3 流量趋势：每平台每日流量 = likes + comments + favorites
        this.postRepo.query(
          `SELECT DATE_FORMAT(p.published_at, '%Y-%m-%d') AS date, p.platform AS platform,
                  COALESCE(SUM(p.likes), 0) + COALESCE(SUM(p.comments), 0) + COALESCE(SUM(p.favorites), 0) AS traffic
           FROM posts p
           WHERE ${postWhereSql}
           GROUP BY date, p.platform
           ORDER BY date ASC`,
          postParams,
        ),
        // 5. T6.3 获客效率按日：每平台每日 post_count / lead_count
        // lead_count 来自 lead 表（不限定 account，因效率按平台整体看）
        // 用子查询关联到 p.published_at + p.platform
        // 注意：GROUP BY 必须包含 p.published_at, p.platform（与 SELECT 中的 date alias 功能依赖；
        // 但 only_full_group_by 模式下 MySQL 不识别别名与原始列的依赖关系，所以保留原始列）
        // W2 修复：DATE(l.created_at) 与 DATE(p.published_at) 对齐，避免 DATETIME vs DATE 类型不匹配导致 0 值
        this.postRepo.query(
          `SELECT DATE_FORMAT(p.published_at, '%Y-%m-%d') AS date, p.platform AS platform,
                  COUNT(*) AS post_count,
                  COALESCE((
                    SELECT COUNT(*) FROM leads l
                    WHERE DATE(l.created_at) = DATE(p.published_at)
                      AND l.platform = p.platform
                      ${employeeId ? 'AND l.employee_id = ?' : ''}
                      ${accountId ? 'AND l.account_id = ?' : ''}
                  ), 0) AS lead_count
           FROM posts p
           WHERE ${postWhereSql}
           GROUP BY p.published_at, p.platform
           ORDER BY p.published_at ASC`,
          this.appendEfficiencyLeadParams(platform, employeeId, accountId, postParams),
        ),
        // 6. T6.3 获客帖效率按日：每平台每日 lead_post_count（post_type IN 获客贴/营销贴） / lead_count
        this.postRepo.query(
          `SELECT DATE_FORMAT(p.published_at, '%Y-%m-%d') AS date, p.platform AS platform,
                  SUM(CASE WHEN p.post_type IN ('获客贴', '营销贴') THEN 1 ELSE 0 END) AS lead_post_count,
                  COALESCE((
                    SELECT COUNT(*) FROM leads l
                    WHERE DATE(l.created_at) = DATE(p.published_at)
                      AND l.platform = p.platform
                      ${employeeId ? 'AND l.employee_id = ?' : ''}
                      ${accountId ? 'AND l.account_id = ?' : ''}
                  ), 0) AS lead_count
           FROM posts p
           WHERE ${postWhereSql}
           GROUP BY p.published_at, p.platform
           ORDER BY p.published_at ASC`,
          this.appendEfficiencyLeadParams(platform, employeeId, accountId, postParams),
        ),
        // 7. T6.4 按员工聚合：postCount / leadCount
        this.postRepo.query(
          `SELECT p.employee_id AS employee_id,
                  COALESCE(e.name, p.employee_id) AS name,
                  COUNT(*) AS post_count,
                  COALESCE((
                    SELECT COUNT(*) FROM leads l
                    WHERE l.employee_id = p.employee_id
                      ${platform ? 'AND l.platform = ?' : ''}
                      ${accountId ? 'AND l.account_id = ?' : ''}
                      AND DATE(l.created_at) BETWEEN ? AND ?
                  ), 0) AS lead_count
           FROM posts p
           LEFT JOIN employees e ON e.id = p.employee_id
           WHERE ${postWhereSql}
           GROUP BY p.employee_id, e.name
           ORDER BY lead_count DESC, post_count DESC
           LIMIT 50`,
          this.appendRatioLeadParams(platform, employeeId, accountId, postParams, from, to),
        ),
        // 8. T6.4 按员工聚合：leadPostCount（获客贴/营销贴） / leadCount
        this.postRepo.query(
          `SELECT p.employee_id AS employee_id,
                  COALESCE(e.name, p.employee_id) AS name,
                  SUM(CASE WHEN p.post_type IN ('获客贴', '营销贴') THEN 1 ELSE 0 END) AS lead_post_count,
                  COALESCE((
                    SELECT COUNT(*) FROM leads l
                    WHERE l.employee_id = p.employee_id
                      ${platform ? 'AND l.platform = ?' : ''}
                      ${accountId ? 'AND l.account_id = ?' : ''}
                      AND DATE(l.created_at) BETWEEN ? AND ?
                  ), 0) AS lead_count
           FROM posts p
           LEFT JOIN employees e ON e.id = p.employee_id
           WHERE ${postWhereSql}
           GROUP BY p.employee_id, e.name
           ORDER BY lead_count DESC, lead_post_count DESC
           LIMIT 50`,
          this.appendRatioLeadParams(platform, employeeId, accountId, postParams, from, to),
        ),
      ]);

    // 把 efficiencyByDay 转成前端期望的 {date, platform, postCount, leadCount, efficiency}
    const efficiencyTrend = (efficiencyByDay as any[]).map((row) => {
      const postCount = Number(row.post_count || 0);
      const leadCount = Number(row.lead_count || 0);
      return {
        date: formatDateOnly(row.date),
        platform: row.platform,
        postCount,
        leadCount,
        efficiency: postCount > 0 ? Number((leadCount / postCount).toFixed(2)) : 0,
      };
    });
    // 把 leadEfficiencyByDay 转成前端期望的 {date, platform, leadPostCount, leadCount, efficiency}
    const leadEfficiencyTrend = (leadEfficiencyByDay as any[]).map((row) => {
      const leadPostCount = Number(row.lead_post_count || 0);
      const leadCount = Number(row.lead_count || 0);
      return {
        date: formatDateOnly(row.date),
        platform: row.platform,
        leadPostCount,
        leadCount,
        efficiency: leadPostCount > 0 ? Number((leadCount / leadPostCount).toFixed(2)) : 0,
      };
    });
    // T6.4 按员工聚合行格式
    const efficiencyRatio = (efficiencyByEmployee as any[]).map((row) => ({
      employeeId: row.employee_id,
      name: row.name,
      postCount: Number(row.post_count || 0),
      leadCount: Number(row.lead_count || 0),
    }));
    const leadPostRatio = (leadEfficiencyByEmployee as any[]).map((row) => ({
      employeeId: row.employee_id,
      name: row.name,
      leadPostCount: Number(row.lead_post_count || 0),
      leadCount: Number(row.lead_count || 0),
    }));

    return {
      filters: { platform, employeeId: employeeId || '', accountId: accountId || '', from, to },
      platformTrend: (platformTrend as any[]).map((row) => ({
        date: formatDateOnly(row.date),
        platform: row.platform,
        postCount: Number(row.post_count || 0),
        likes: Number(row.likes || 0),
      })),
      postStructure: (postStructure as any[]).map((row) => ({
        type: normalizePostType(row.type),
        count: Number(row.count || 0),
      })),
      leadTrend: (leadTrend as any[]).map((row) => ({
        date: formatDateOnly(row.date),
        platform: row.platform,
        leadCount: Number(row.lead_count || 0),
      })),
      // T6.3
      trafficTrend: (trafficTrend as any[]).map((row) => ({
        date: formatDateOnly(row.date),
        platform: row.platform,
        traffic: Number(row.traffic || 0),
      })),
      efficiencyTrend,
      leadEfficiencyTrend,
      // T6.4
      efficiencyRatio,
      leadPostRatio,
    };
  }

  /**
   * efficiencyByDay / leadEfficiencyByDay 子查询里额外需要 employeeId / accountId 参数
   * （子查询内 platform 与 p.platform 已匹配，不再需要单独传）。
   */
  private appendEfficiencyLeadParams(
    platform: string | null,
    employeeId: string | undefined,
    accountId: string | undefined,
    baseParams: any[],
  ): any[] {
    void platform;
    const extra: any[] = [];
    if (employeeId) extra.push(employeeId);
    if (accountId) extra.push(accountId);
    return [...baseParams, ...extra];
  }

  /** efficiencyRatio / leadPostRatio 子查询里额外需要 platform / accountId + from/to */
  private appendRatioLeadParams(
    platform: string | null,
    employeeId: string | undefined,
    accountId: string | undefined,
    baseParams: any[],
    from: string,
    to: string,
  ): any[] {
    const extra: any[] = [];
    if (platform) extra.push(platform);
    if (accountId) extra.push(accountId);
    extra.push(from, to);
    // employeeId 已在主表 WHERE 过滤，子查询里不需要再传
    void employeeId;
    return [...baseParams, ...extra];
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
    // 工具方法：把 Date 的"本地日历"年月日拼成 YYYY-MM-DD，避免 toISOString()
    // 在非 UTC 环境下把日期往前推一天（Asia/Shanghai 经常 06-30 → 06-29）
    const toYmd = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const to = new Date(today);
    const normalized = String(period || '').toLowerCase();
    const from = new Date(to);
    let toEnd = new Date(to);
    if (['week', 'thisweek', '本周'].includes(normalized)) {
      // 本周 = 周一 ~ 周日（dayjs locale zh-cn endOf('week') 等价于周日）
      // getDay(): 周日=0, 周一=1 ... 周六=6；用 (getDay() || 7) 把周日归到 7
      const day = from.getDay() || 7;
      from.setDate(from.getDate() - day + 1);
      // 本周日 = 本周一 + 6 天
      toEnd.setDate(toEnd.getDate() + (7 - day));
    } else if (['month', 'thismonth', '本月'].includes(normalized)) {
      // 本月 = 1 号 ~ 本月最后一天（dayjs endOf('month') 等价物）
      from.setDate(1);
      // 切到下月 0 号 = 本月最后一天（用本地日历重算，不要 toISOString）
      toEnd = new Date(to.getFullYear(), to.getMonth() + 1, 0);
    } else if (['all', 'total', '累计'].includes(normalized)) {
      return { from: '1970-01-01', to: today };
    }
    return {
      from: toYmd(from),
      to: toYmd(toEnd),
    };
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
