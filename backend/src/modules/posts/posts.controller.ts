import { Controller, Get, Post, Put, Delete, Body, Param, Req, Res } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsMetricsService } from './posts-metrics.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';
import { todayString } from '../../shared/utils/date-utils';

@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly postsMetricsService: PostsMetricsService,
  ) {}

  @Get()
  async findAll(@Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId: string = session?.userId || '';
    const pagination = this.parsePagination((req as any).query || {});
    if (session?.role === 'staff' && session?.employeeId) {
      // staff 视角：默认按本人作品过滤；userId 非空则附带 isFavorited
      const result = userId
        ? await this.postsService.findByEmployeeWithFavoritePage(session.employeeId, userId, pagination)
        : await this.postsService.findByEmployeePage(session.employeeId, pagination);
      return res.json(result);
    }
    // admin/owner 视角：拉全量；登录态有 userId 时补充 isFavorited
    const result = userId
      ? await this.postsService.findAllWithFavoritePage(userId, pagination)
      : await this.postsService.findAllPage(pagination);
    return res.json(result);
  }

  /**
   * 作品广场（#6 权限分流）：
   * - staff 强制 view=excellent（leads_count >= 5），忽略前端传入 view
   * - admin/owner 接受 view=all|excellent|favorites（默认 all）
   * 返回每条作品附带 leadsCount 与 isFavorited（基于当前登录用户）。
   */
  @Get('plaza')
  async findPlaza(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const role = session?.role;
    const userId: string = session?.userId || '';
    const isStaff = role === 'staff';

    // 解析 view，仅 admin/owner 可控；staff 强制 excellent
    const rawView = String((req.query as any)?.view || '').toLowerCase();
    const allowedViews = ['all', 'excellent', 'favorites'];
    let view: 'all' | 'excellent' | 'favorites';
    if (isStaff) {
      view = 'excellent';
    } else if (allowedViews.includes(rawView)) {
      view = rawView as 'all' | 'excellent' | 'favorites';
    } else {
      view = 'all';
    }

    const platform = String((req.query as any)?.platform || '').trim() || undefined;
    const postType = String((req.query as any)?.postType || '').trim() || undefined;
    const employeeId = String((req.query as any)?.employeeId || '').trim() || undefined;

    const rows = await this.postsService.findPlaza({
      view,
      platform,
      postType,
      employeeId,
      userId,
    });
    return res.json({ ok: true, view, rows });
  }

  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const postId = makeId();
    await this.postsService.create({
      id: postId,
      employeeId: session?.employeeId || '',
      accountId: body.accountId,
      platform: body.platform,
      title: body.title,
      copywriting: body.copywriting || '',
      coverImageUrl: body.coverImageUrl,
      postUrl: body.postUrl,
      postType: body.postType,
      traffic: body.traffic || 0,
      likes: body.likes || 0,
      comments: body.comments || 0,
      favorites: body.favorites || 0,
      shares: body.shares || 0,
      publishedAt: body.publishedAt || todayString(),
      note: body.note,
      supervisorSuggestion: body.supervisorSuggestion || '',
    });
    return res.json({ ok: true });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const allowed = await this.ensurePostWritable(id, req, res);
    if (!allowed) return;
    await this.postsService.update(id, {
      accountId: body.accountId,
      title: body.title,
      copywriting: body.copywriting,
      coverImageUrl: body.coverImageUrl,
      postUrl: body.postUrl,
      postType: body.postType,
      traffic: body.traffic,
      likes: body.likes,
      comments: body.comments,
      favorites: body.favorites,
      shares: body.shares,
      publishedAt: body.publishedAt,
      note: body.note,
      supervisorSuggestion: body.supervisorSuggestion,
    });
    return res.json({ ok: true });
  }

  @Put(':id/supervisor-suggestion')
  async updateSupervisorSuggestion(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    await this.postsService.updateSupervisorSuggestion(id, body.supervisorSuggestion);
    return res.json({ ok: true });
  }

  @Post(':id/fetch-metrics')
  async fetchMetrics(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    const post = await this.postsService.findById(id);
    if (!post) return res.status(404).json({ message: '作品不存在' });
    if (!body.postUrl) return res.status(400).json({ message: '请先填写作品链接' });

    try {
      const metrics = await this.postsMetricsService.fetchMetricsFromUrl(body.postUrl);
      await this.postsService.updateMetrics(id, metrics);
      // 写入抓取快照历史，便于前端展示「上次抓取」与回退
      await this.postsService.saveMetricsHistory(id, metrics);
      return res.json({ ok: true, metrics });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || '抓取失败' });
    }
  }

  @Post('refresh-metrics')
  async refreshMetrics(@Body() body: any, @Res() res: Response) {
    // Legacy: synchronous batch refresh
    const requestedIds = Array.isArray(body?.postIds)
      ? new Set(body.postIds.map((id: any) => String(id || '')).filter(Boolean))
      : null;
    const posts = await this.postsService.findAll();
    const eligible = posts.filter((p) => p.postUrl && (!requestedIds || requestedIds.has(String(p.id))));
    if (eligible.length === 0) {
      return res.status(400).json({ message: '当前范围内没有可刷新的作品' });
    }
    const results: any[] = [];
    for (const post of eligible) {
      try {
        const metrics = await this.postsMetricsService.fetchMetricsFromUrl(post.postUrl);
        await this.postsService.updateMetrics(post.id, metrics);
        // 同步写入历史快照，与单条刷新保持一致
        await this.postsService.saveMetricsHistory(post.id, metrics);
        results.push({ id: post.id, title: post.title || '', success: true, metrics });
      } catch (error: any) {
        results.push({
          id: post.id,
          title: post.title || '',
          success: false,
          message: error?.message || '抓取失败',
        });
      }
    }
    return res.json({ ok: true, results });
  }

  @Post('rollback-metrics')
  async rollbackMetrics(@Body() body: any, @Res() res: Response) {
    // Placeholder: rollback to snapshot date — keeps legacy behavior
    return res.json({ ok: true, message: '快照回退功能待实现' });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const allowed = await this.ensurePostWritable(id, req, res);
    if (!allowed) return;
    await this.postsService.remove(id);
    return res.json({ ok: true });
  }

  /**
   * 校验作品写操作权限：staff 只能操作本人归属作品，主管角色放行。
   */
  private async ensurePostWritable(id: string, req: Request, res: Response): Promise<boolean> {
    const session = (req as any).session;
    const post = await this.postsService.findById(id);
    if (!post) {
      res.status(404).json({ message: '作品不存在' });
      return false;
    }
    if (session?.role === 'staff' && post.employeeId !== session?.employeeId) {
      res.status(403).json({ message: `无权操作他人作品：postId=${id}` });
      return false;
    }
    return true;
  }

  /**
   * 解析作品列表分页参数，兼容 limit/offset 与 page/pageSize。
   */
  private parsePagination(query: any): { limit: number; offset: number } {
    const pageSize = Number(query?.pageSize);
    const page = Number(query?.page);
    const rawLimit = Number(query?.limit);
    const limit = Math.min(Math.max(Number.isFinite(pageSize) && pageSize > 0 ? pageSize : (Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20), 1), 200);
    const rawOffset = Number(query?.offset);
    const offset = Number.isFinite(page) && page > 0
      ? (Math.floor(page) - 1) * limit
      : (Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0);
    return { limit, offset };
  }
}
