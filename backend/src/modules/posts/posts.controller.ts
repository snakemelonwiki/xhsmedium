import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsMetricsService } from './posts-metrics.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';
import { todayString } from '../../shared/utils/date-utils';
import { DebounceGuard } from '../../common/debounce.guard';

@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly postsMetricsService: PostsMetricsService,
  ) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('employeeId') employeeId?: string,
    @Query('accountId') accountId?: string,
    @Query('platform') platform?: string,
    @Query('postType') postType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sort') sort?: string,
  ) {
    const session = (req as any).session;
    const wantsPaging = limit !== undefined || offset !== undefined;

    if (wantsPaging) {
      if (session?.role === 'staff' && session?.employeeId) {
        const result = await this.postsService.findPaged(
          {
            employeeId: session.employeeId,
            accountId,
            platform,
            postType,
            from,
            to,
            sort,
          },
          Number(limit) || 20,
          Number(offset) || 0,
        );
        return res.json(result);
      }
      const result = await this.postsService.findPaged(
        {
          employeeId,
          accountId,
          platform,
          postType,
          from,
          to,
          sort,
        },
        Number(limit) || 20,
        Number(offset) || 0,
      );
      return res.json(result);
    }

    if (session?.role === 'staff' && session?.employeeId) {
      const rows = await this.postsService.findByEmployee(session.employeeId);
      return res.json(rows);
    }
    const rows = await this.postsService.findAll();
    return res.json(rows);
  }

  /**
   * 作品广场：
   * - staff 强制只看优秀作品（获客数 >= 5）
   * - admin/owner 可切换 all/excellent/favorites
   * 返回字段包含 leadsCount、favoriteCount、isFavorited。
   */
  @Get('plaza')
  async findPlaza(
    @Req() req: Request,
    @Res() res: Response,
    @Query('view') view?: string,
    @Query('platform') platform?: string,
    @Query('postType') postType?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const session = (req as any).session;
    const role = session?.role || '';
    const userId = session?.userId || session?.id || '';
    const allowedViews = new Set(['all', 'excellent', 'favorites']);
    const requestedView = allowedViews.has(String(view || '').toLowerCase())
      ? String(view || '').toLowerCase()
      : 'all';
    const effectiveView = role === 'staff' ? 'excellent' : requestedView;

    const rows = await this.postsService.findPlaza({
      view: effectiveView as 'all' | 'excellent' | 'favorites',
      platform: platform || undefined,
      postType: postType || undefined,
      employeeId: employeeId || undefined,
      userId,
    });
    return res.json({ ok: true, view: effectiveView, rows });
  }

  @Post()
  @UseGuards(DebounceGuard)
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
      publishedAt: body.publishedAt || todayString(),
      note: body.note,
      supervisorSuggestion: body.supervisorSuggestion || '',
    });
    return res.json({ ok: true });
  }

  @Put(':id')
  @UseGuards(DebounceGuard)
  async update(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
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
      await this.postsService.recordMetricsHistory(id, metrics);
      return res.json({ ok: true, metrics });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || '抓取失败' });
    }
  }

  @Post('refresh-metrics')
  async refreshMetrics(@Body() body: any, @Res() res: Response) {
    const postIds = Array.isArray(body?.postIds)
      ? body.postIds.map((id: any) => String(id || '').trim()).filter(Boolean)
      : [];
    const posts = postIds.length
      ? await this.postsService.findByIds(postIds)
      : await this.postsService.findAll();
    const eligible = posts.filter((p) => p.postUrl);
    if (eligible.length === 0) {
      return res.status(400).json({ message: '当前范围内没有可刷新的作品' });
    }
    const results: any[] = [];
    for (const post of eligible) {
      try {
        const metrics = await this.postsMetricsService.fetchMetricsFromUrl(post.postUrl);
        await this.postsService.updateMetrics(post.id, metrics);
        await this.postsService.recordMetricsHistory(post.id, metrics);
        results.push({ id: post.id, success: true });
      } catch (error: any) {
        results.push({ id: post.id, success: false, reason: error?.message || '刷新失败' });
      }
    }
    return res.json({
      ok: true,
      scoped: postIds.length > 0,
      requested: postIds.length || posts.length,
      refreshed: results.filter((item) => item.success).length,
      failed: results.filter((item) => !item.success).length,
      results,
    });
  }

  @Post('rollback-metrics')
  async rollbackMetrics(@Body() body: any, @Res() res: Response) {
    // Placeholder: rollback to snapshot date — keeps legacy behavior
    return res.json({ ok: true, message: '快照回退功能待实现' });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.postsService.remove(id);
    return res.json({ ok: true });
  }
}
