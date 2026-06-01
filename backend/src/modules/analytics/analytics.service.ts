import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';

interface DailySnapshot {
  posts: number;
  leads: number;
  deals: number;
  traffic: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
  ) {}

  /**
   * 返回最近 N 天的日聚合数据，替代旧的 daily-snapshots.json。
   * 仅查 posts/leads 两张表，对每天聚合一次。N 默认 7。
   * 返回结构：{ snapshots: { 'YYYY-MM-DD': { posts, leads, deals, traffic } } }
   */
  async getSnapshots(days = 7): Promise<{ snapshots: Record<string, DailySnapshot> }> {
    const safeDays = Math.max(1, Math.min(Number(days) || 7, 90));
    const dates = this.recentDates(safeDays);

    const [postRows, leadRows] = await Promise.all([
      this.postRepo.query(
        `SELECT DATE_FORMAT(published_at, '%Y-%m-%d') AS d,
                COUNT(*) AS posts,
                COALESCE(SUM(CASE WHEN post_type IN ('获客贴','营销贴') THEN traffic ELSE 0 END), 0) AS traffic
         FROM posts
         WHERE published_at BETWEEN ? AND ?
         GROUP BY d`,
        [dates[0], dates[dates.length - 1]],
      ),
      this.leadRepo.query(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d,
                COUNT(*) AS leads,
                SUM(CASE WHEN process_status = 'deal_done' THEN 1 ELSE 0 END) AS deals
         FROM leads
         WHERE created_at BETWEEN ? AND ?
         GROUP BY d`,
        [`${dates[0]} 00:00:00`, `${dates[dates.length - 1]} 23:59:59`],
      ),
    ]);

    const snapshots: Record<string, DailySnapshot> = {};
    for (const d of dates) {
      snapshots[d] = { posts: 0, leads: 0, deals: 0, traffic: 0 };
    }
    for (const row of postRows as any[]) {
      if (snapshots[row.d]) {
        snapshots[row.d].posts = Number(row.posts || 0);
        snapshots[row.d].traffic = Number(row.traffic || 0);
      }
    }
    for (const row of leadRows as any[]) {
      if (snapshots[row.d]) {
        snapshots[row.d].leads = Number(row.leads || 0);
        snapshots[row.d].deals = Number(row.deals || 0);
      }
    }
    return { snapshots };
  }

  private recentDates(days: number): string[] {
    const out: string[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }
}
