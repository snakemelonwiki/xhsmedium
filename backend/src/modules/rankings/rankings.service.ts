import { Injectable } from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.service';
import { PostsService } from '../posts/posts.service';
import { LeadsService } from '../leads/leads.service';
import { normalizePostType } from '../../shared/utils/normalize';

@Injectable()
export class RankingsService {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly postsService: PostsService,
    private readonly leadsService: LeadsService,
  ) {}

  async getRankings(type: string, date: string): Promise<any[]> {
    const rows = await this.dashboardService.rankingRows(date);
    const posts = await this.postsService.findAll();
    const leads = await this.leadsService.findAll();

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
      return rows.map((r) => ({
        ...r,
        postCount: postCountByEmployee[r.employeeId]?.total || 0,
        xhsPostCount: postCountByEmployee[r.employeeId]?.xhs || 0,
        douyinPostCount: postCountByEmployee[r.employeeId]?.douyin || 0,
      }));
    }

    if (type === 'leads') {
      const leadCountByEmployee: Record<string, number> = {};
      for (const lead of leads) {
        leadCountByEmployee[lead.employeeId] = (leadCountByEmployee[lead.employeeId] || 0) + 1;
      }
      return rows.map((r) => ({
        ...r,
        leadCount: leadCountByEmployee[r.employeeId] || 0,
      }));
    }

    return rows;
  }

  async getRankingsPaged(type: string, date: string, limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    // TODO: 当前为内存分页，getRankings 会全量加载 posts + leads。当数据量增长时，
    // 需要将聚合逻辑下沉到 SQL，避免全表加载后再 slice。后续可改为纯 SQL 聚合或缓存。
    const allRows = await this.getRankings(type, date);
    const total = allRows.length;
    const items = allRows.slice(offset, offset + limit);
    return { items, total, limit, offset };
  }

  async getLearningPosts(days: number = 7): Promise<any[]> {
    const posts = await this.postsService.findAll();
    const leads = await this.leadsService.findAll();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const leadCountByPost: Record<string, number> = {};
    for (const lead of leads) {
      if (lead.postId) {
        leadCountByPost[lead.postId] = (leadCountByPost[lead.postId] || 0) + 1;
      }
    }

    return posts
      .filter((p) => new Date(p.publishedAt) >= cutoff)
      .map((p) => ({
        ...p,
        leadCount: leadCountByPost[p.id] || 0,
      }))
      .sort((a, b) => b.leadCount - a.leadCount || b.likes - a.likes)
      .slice(0, 10);
  }
}
