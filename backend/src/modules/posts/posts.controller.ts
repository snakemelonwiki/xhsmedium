import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsMetricsService } from './posts-metrics.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';
import { todayString } from '../../shared/utils/date-utils';
import { DebounceGuard } from '../../common/debounce.guard';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { getSessionUserId } from '../../common/session.utils';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

@Controller('posts')
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly postsMetricsService: PostsMetricsService,
    private readonly operationLogs: OperationLogsService,
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
    @Query('search') search?: string,
    @Query('keyword') keyword?: string,
    @Query('q') q?: string,
  ) {
    const session = (req as any).session;
    const wantsPaging = limit !== undefined || offset !== undefined;
    const nextSearch = (search || keyword || q || '').trim();

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
            search: nextSearch,
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
          search: nextSearch,
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
   * 解析作品链接，识别平台并返回可回填的基础字段。
   */
  @Post('parse-link')
  async parseLink(@Body() body: any, @Res() res: Response) {
    const postUrl = String(body?.postUrl || body?.url || '').trim();
    if (!postUrl) {
      return res.status(400).json({ ok: false, message: '作品链接不能为空' });
    }
    return res.json({ ok: true, data: this.postsService.parsePostLink(postUrl) });
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
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const session = (req as any).session;
    const role = session?.role || '';
    const userId = getSessionUserId(req);
    const allowedViews = new Set(['all', 'excellent', 'favorites']);
    const requestedView = allowedViews.has(String(view || '').toLowerCase())
      ? String(view || '').toLowerCase()
      : 'all';
    const effectiveView = role === 'staff' ? 'excellent' : requestedView;

    const result = await this.postsService.findPlaza(
      {
        view: effectiveView as 'all' | 'excellent' | 'favorites',
        platform: platform || undefined,
        postType: postType || undefined,
        employeeId: employeeId || undefined,
        userId,
      },
      Number(page) || 1,
      Number(pageSize) || 20,
    );
    return res.json({ ok: true, view: effectiveView, ...result });
  }

  @Post()
  @UseGuards(DebounceGuard)
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const duplicate = body?.postUrl
      ? await this.postsService.findDuplicateByUrl(body.postUrl)
      : null;
    if (duplicate) {
      return res.status(409).json({ ok: false, message: '作品链接已存在', duplicate });
    }
    const postId = makeId();
    await this.postsService.create({
      id: postId,
      employeeId: session?.employeeId || '',
      accountId: body.accountId,
      platform: body.platform,
      title: body.title,
      copywriting: body.copywriting || '',
      coverImageUrl: body.coverImageUrl,
      coverThumbUrl: body.coverThumbUrl,
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

  // 注意：批量导入模板下载必须位于 `:id` 路由之前，否则 NestJS 会把
  // `import-template.xlsx` 当作 :id 命中 findOne 并返回"作品不存在"。
  @Get('import-template.xlsx')
  async downloadImportTemplate(@Res() res: Response) {
    const BOM = '﻿';
    const csv =
      BOM +
      '平台,标题,作品类型,作品链接,账号ID,发布时间,文案,封面URL,流量,点赞,评论,收藏,备注\n' +
      '小红书,示例作品,获客贴,https://example.com,,2026-05-31,示例文案,,0,0,0,0,备注\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="posts_import_template.csv"');
    return res.send(csv);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    const post = await this.postsService.findById(id);
    if (!post) return res.status(404).json({ message: '作品不存在' });
    return res.json(post);
  }

  @Put(':id')
  @UseGuards(DebounceGuard)
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.updatePost(id, body, req, res);
  }

  /**
   * 兼容 v1.2 接口契约，PATCH 与 PUT 共享作品更新逻辑。
   */
  @Patch(':id')
  @UseGuards(DebounceGuard)
  async patch(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.updatePost(id, body, req, res);
  }

  /**
   * 手动写入作品指标，并保存一条历史快照。
   */
  @Post(':id/metrics')
  async saveMetrics(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    const post = await this.postsService.findById(id);
    if (!post) return res.status(404).json({ message: '作品不存在' });
    const metrics = {
      likes: Number(body?.likes || 0),
      comments: Number(body?.comments || 0),
      favorites: Number(body?.favorites || 0),
      shares: Number(body?.shares || 0),
      metricsUpdatedAt: new Date(),
    };
    await this.postsService.updateMetrics(id, metrics);
    await this.postsService.recordMetricsHistory(id, metrics);
    return res.json({ ok: true });
  }

  /**
   * 读取作品指标历史，用于作品详情和主管看板查看趋势。
   */
  @Get(':id/metrics')
  async getMetrics(@Param('id') id: string, @Res() res: Response) {
    const items = await this.postsService.getMetricsHistory(id);
    return res.json({ items });
  }

  /**
   * 更新作品基础字段，并对 staff 做归属校验。
   */
  private async updatePost(id: string, body: any, req: Request, res: Response) {
    const session = (req as any).session;
    if (session?.role === 'staff') {
      const post = await this.postsService.findById(id);
      if (!post) return res.status(404).json({ message: '作品不存在' });
      if (post.employeeId !== session.employeeId) {
        return res.status(403).json({ ok: false, message: '无权操作他人作品' });
      }
    }
    const duplicate = body?.postUrl
      ? await this.postsService.findDuplicateByUrl(body.postUrl, id)
      : null;
    if (duplicate) {
      return res.status(409).json({ ok: false, message: '作品链接已存在', duplicate });
    }
    await this.postsService.update(id, {
      accountId: body.accountId,
      title: body.title,
      copywriting: body.copywriting,
      coverImageUrl: body.coverImageUrl,
      coverThumbUrl: body.coverThumbUrl,
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
  async remove(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    if (session?.role === 'staff') {
      const post = await this.postsService.findById(id);
      if (!post) return res.status(404).json({ message: '作品不存在' });
      if (post.employeeId !== session.employeeId) {
        return res.status(403).json({ ok: false, message: '无权操作他人作品' });
      }
    }
    // E/P1-01: 写一条 DELETE 操作日志（targetType=post）。
    const before = await this.postsService.findById(id);
    await this.postsService.remove(id);
    try {
      await this.operationLogs.log({
        userId: getSessionUserId(req),
        action: OPERATION_LOG_ACTIONS.DELETE,
        targetType: OPERATION_LOG_TARGET_TYPES.POST,
        targetId: id,
        detail: stringifyDetail({
          title: before?.title || null,
          platform: before?.platform || null,
          employeeId: before?.employeeId || null,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[posts] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }
}
