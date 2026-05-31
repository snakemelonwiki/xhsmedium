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

  /**
   * 学习榜：返回最近 N 天发布且至少有 1 条 leads 的作品 Top10。
   * 字段风格与作品广场 findPlaza 保持一致，附带 leadsCount、isFavorited。
   * userId 为空字符串时 isFavorited 全部为 false。
   */
  async getLearningPosts(days: number = 7, userId: string = ''): Promise<any[]> {
    // 计算截止时间，按业务约定使用日期阈值
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // 一条裸 SQL：聚合 leads_count + EXISTS 出 is_favorited，并按要求排序
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
          WHERE fav.target_type = 'post' AND fav.target_id = p.id COLLATE utf8mb4_unicode_ci
            AND fav.user_id = ? AND fav.deleted = 0
        ) AS is_favorited
      FROM posts p
      WHERE p.published_at >= ?
      HAVING leads_count >= 1
      ORDER BY leads_count DESC, p.likes DESC, p.published_at DESC
      LIMIT 10
    `;

    const rows = await this.postRepository.query(sql, [userId || '', cutoffStr]);
    return (rows as any[]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      accountId: r.account_id,
      platform: r.platform,
      title: r.title,
      copywriting: r.copywriting || '',
      coverImageUrl: r.cover_image_url,
      postUrl: r.post_url,
      postType: normalizePostType(r.post_type),
      traffic: normalizeTrafficByType(r.post_type, Number(r.traffic || 0)),
      likes: Number(r.likes || 0),
      comments: Number(r.comments || 0),
      favorites: Number(r.favorites || 0),
      shares: Number(r.shares || 0),
      metricsUpdatedAt: r.metrics_updated_at,
      publishedAt: r.published_at,
      leadsCount: Number(r.leads_count || 0),
      isFavorited: Number(r.is_favorited || 0) === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }
}
