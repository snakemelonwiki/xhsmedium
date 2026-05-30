import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';
import { Employee } from '../../entities/employee.entity';
import { Account } from '../../entities/account.entity';
import { normalizePostType } from '../../shared/utils/normalize';
import { todayString } from '../../shared/utils/date-utils';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
  ) {}

  async getSummary(today: string = todayString()): Promise<any> {
    const [updatedEmployees, updatedAccounts, xhsPosts, douyinPosts, xhsMetrics, douyinMetrics, leads, deals] = await Promise.all([
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
    };
  }

  async getPostTypeDistribution(today: string = todayString()): Promise<any[]> {
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

  async rankingRows(today: string = todayString()): Promise<any[]> {
    const raw = await this.employeeRepo.query(`
      SELECT
        e.id AS employee_id,
        e.name,
        (SELECT COUNT(*) FROM accounts a WHERE a.employee_id = e.id) AS account_count,
        (SELECT COUNT(*) FROM posts p WHERE p.employee_id = e.id AND p.published_at = ?) AS today_posts,
        (SELECT COUNT(*) FROM leads l WHERE l.employee_id = e.id AND DATE(l.created_at) = ?) AS today_leads,
        (SELECT COALESCE(SUM(CASE WHEN p.post_type IN ('获客贴', '营销贴') THEN p.traffic ELSE 0 END), 0) FROM posts p WHERE p.employee_id = e.id AND p.published_at = ?) AS today_traffic,
        (SELECT COUNT(*) FROM leads l WHERE l.employee_id = e.id AND DATE(l.created_at) = ? AND l.status = '已成交') AS today_deals
      FROM employees e
      ORDER BY e.created_at DESC
    `, [today, today, today, today]);

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
}
