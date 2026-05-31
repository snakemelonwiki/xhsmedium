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
