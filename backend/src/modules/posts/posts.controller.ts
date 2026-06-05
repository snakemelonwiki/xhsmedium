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
    // 修复 (2026-06-05)：新增 url / postUrl 过滤，给前端"提交前重复检查"使用。
    //   之前 ?url= 被静默忽略，checkDuplicate 拿到的是"当前运营最新一条"——任何提交都会被误判为重复，
    //   导致 POST /posts 直接被前端拦下，提交后页面不跳转、列表里也看不到新数据。
    @Query('url') url?: string,
    @Query('postUrl') postUrl?: string,
    // v1.3 / OP-14: 作品广场范围放宽，staff 显式传 scope=all 时不再强制按本人过滤
    @Query('scope') scope?: 'self' | 'all',
  ) {
    const session = (req as any).session;
    const wantsPaging = limit !== undefined || offset !== undefined;
    const nextSearch = (search || keyword || q || '').trim();
    // 仅当 staff 显式传 scope=all 时不强制本人过滤（默认 self 保留旧行为）
    const isStaff = session?.role === 'staff' && session?.employeeId;
    const forceSelf = isStaff && scope !== 'all';
    // 透传 viewer 给 service，让 isFavorited 等个人化字段按当前用户返回
    const viewer = {
      viewerUserId: getSessionUserId(req),
      viewerRole: String(session?.role || '').toLowerCase(),
      viewerEmployeeId: session?.employeeId,
    };

    if (wantsPaging) {
      // 漏洞1修复：staff 强制只用 session.employeeId 过滤，不能通过 query 参数绕过
      //   v1.3 / OP-14 例外：scope=all 时，staff 也可以看全公司作品（前端 Gallery 用）
      if (forceSelf) {
        const result = await this.postsService.findPaged(
          {
            employeeId: session.employeeId, // 强制使用 session 的 employeeId
            accountId,
            platform,
            postType,
            from,
            to,
            sort,
            search: nextSearch,
            url,
            postUrl,
          },
          Number(limit) || 20,
          Number(offset) || 0,
          viewer,
        );
        return res.json(result);
      }
      // 非 staff 或 scope=all：employeeId 参数由 query 决定（主管可查任意员工；staff 看全公司）
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
          url,
          postUrl,
        },
        Number(limit) || 20,
        Number(offset) || 0,
        viewer,
      );
      return res.json(result);
    }

    if (forceSelf) {
      const rows = await this.postsService.findByEmployee(session.employeeId, viewer);
      return res.json(rows);
    }
    const rows = await this.postsService.findAll(viewer);
    return res.json(rows);
  }

  /**
   * 解析作品链接，识别平台并回填表单字段。
   * 沿用 legacy `metricsFetcher.js` 的 Playwright 抓取能力：
   *   - 成功：返回完整标题 + 4 项指标（likes/comments/favorites/shares）
   *   - 抓取失败：返回基础识别 + warning，不抛错（前端可继续录入）
   *   - 未识别平台：返回 platform='其他'，parsed=false
   */
  @Post('parse-link')
  async parseLink(@Body() body: any, @Res() res: Response) {
    const postUrl = String(body?.postUrl || body?.url || '').trim();
    if (!postUrl) {
      return res.status(400).json({ ok: false, message: '作品链接不能为空' });
    }
    const data = await this.postsService.parsePostLink(postUrl, { fetch: body?.fetch !== false });
    return res.json({ ok: true, data });
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
      // v1.3 OP-14: 透传 viewer 用于按权限收敛 leadsCount
      { employeeId: session?.employeeId, role: String(role || '').toLowerCase() },
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

  // 注意：v1.3 SUP-1 `supervisor-picks` 与 v1.3 OP-8 `learning-board` 同样必须位于 :id 路由之前，
  //      否则 'supervisor-picks' / 'learning-board' 会被 :id 抢占命中 findOne。
  /**
   * v1.3 OP-8: 学习榜单维度切换数据源。
   * Query:
   *   - dimension: traffic | leads | composite（默认 composite）
   *   - days: 近 N 天发布的作品，默认 30
   *   - platform: 可选 小红书 / 抖音
   *   - limit: 返回前 N 条，默认 20
   *
   * 返回字段包含 trafficScore / leadsCount / compositeScore / score（按 dimension 选），
   * 前端根据当前 dimension 直接渲染即可。
   */
  @Get('learning-board')
  async getLearningBoard(
    @Req() req: Request,
    @Res() res: Response,
    @Query('dimension') dimension?: string,
    @Query('days') days?: string,
    @Query('platform') platform?: string,
    @Query('limit') limit?: string,
  ) {
    const session = (req as any).session;
    const result = await this.postsService.getLearningBoard(
      {
        dimension: dimension as any,
        days: Number(days) || 30,
        platform: platform || undefined,
        limit: Number(limit) || 20,
      },
      // v1.3 OP-14: 透传 viewer
      { employeeId: session?.employeeId, role: String(session?.role || '').toLowerCase() },
    );
    return res.json({ ok: true, ...result });
  }

  /**
   * 主管分页查询被标记的优秀作品（学习榜单"主管推荐"使用）。
   * Query: pickedBy=可选，过滤"我标记的"; limit/offset
   * 权限：所有登录用户可读（运营/销售/主管/管理员/教务）
   */
  @Get('supervisor-picks')
  async listSupervisorPicks(
    @Req() req: Request,
    @Res() res: Response,
    @Query('pickedBy') pickedBy?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const role = String(session?.role || '').toLowerCase();
    const allowedRoles = new Set(['admin', 'supervisor', 'owner', 'operation', 'staff', 'sales', 'academic']);
    if (!allowedRoles.has(role)) {
      return res.status(403).json({ ok: false, message: '无权查询' });
    }
    const result = await this.postsService.findSupervisorPicks(
      { pickedBy: pickedBy || undefined },
      Number(limit) || 20,
      Number(offset) || 0,
      // v1.3 OP-14: 透传 viewer
      { employeeId: session?.employeeId, role: String(role || '').toLowerCase() },
    );
    return res.json({ ok: true, ...result });
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const viewer = {
      viewerUserId: getSessionUserId(req),
      viewerRole: String(session?.role || '').toLowerCase(),
      viewerEmployeeId: session?.employeeId,
    };
    const post = await this.postsService.findById(id, viewer);
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
   * 漏洞4修复：staff 角色需校验作品归属。
   */
  @Post(':id/metrics')
  async saveMetrics(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const post = await this.postsService.findById(id);
    if (!post) return res.status(404).json({ message: '作品不存在' });
    // 漏洞4修复：staff 角色只能操作自己的作品
    if (session?.role === 'staff' && post.employeeId !== session?.employeeId) {
      return res.status(403).json({ ok: false, message: '无权操作他人作品指标' });
    }
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
   * 读取作品每日指标（从 post_metrics 表），用于图表展示和排行榜聚合。
   * GET /api/posts/:id/metrics/daily?from=2026-01-01&to=2026-06-01
   */
  @Get(':id/metrics/daily')
  async getDailyMetrics(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const post = await this.postsService.findById(id);
    if (!post) return res.status(404).json({ message: '作品不存在' });
    const items = await this.postsService.getDailyMetrics(id, from, to);
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

  // ── v1.3 SUP-1: 主管手动标记优秀作品 ─────────────────────────────
  // supervisor-picks 静态路径已在 :id 路由之前（见文件上方）；
  // :id/pick 与 :id/supervisor-suggestion 同为前缀匹配，按 NestJS 路径注册顺序即可。

  /**
   * 主管标记作品为优秀。
   * 权限：supervisor / admin / owner 角色可调用。
   */
  @Post(':id/pick')
  async pickSupervisor(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const role = String(session?.role || '').toLowerCase();
    if (!['supervisor', 'admin', 'owner'].includes(role)) {
      return res.status(403).json({ ok: false, message: '仅主管/管理员可标记' });
    }
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }
    const result = await this.postsService.markSupervisorPick(id, userId);
    if (!result) {
      return res.status(404).json({ ok: false, message: '作品不存在' });
    }
    return res.json({ ok: true, ...result });
  }

  /**
   * 主管取消标记。
   * 权限：supervisor / admin / owner 角色可调用（与 mark 保持一致）。
   */
  @Delete(':id/pick')
  async unpickSupervisor(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const role = String(session?.role || '').toLowerCase();
    if (!['supervisor', 'admin', 'owner'].includes(role)) {
      return res.status(403).json({ ok: false, message: '仅主管/管理员可取消标记' });
    }
    const result = await this.postsService.unmarkSupervisorPick(id);
    if (!result) {
      return res.status(404).json({ ok: false, message: '作品不存在' });
    }
    return res.json({ ok: true, ...result });
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
      // metricsUpdatedAt 是 Date，JSON 序列化时序列化为 ISO 字符串（Date.prototype.toJSON）
      return res.json({ ok: true, metrics });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || '抓取失败' });
    }
  }

  /**
   * C8 修复：单条作品刷新端点。复用 fetchMetrics + 写 operation_log。
   * POST /api/posts/:id/refresh-metrics  body: { postUrl? }
   * - 已存在作品链接：直接抓取
   * - 未传 postUrl 且作品已存 postUrl：使用现存链接
   */
  @Post(':id/refresh-metrics')
  async refreshSinglePostMetrics(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const post = await this.postsService.findById(id);
    if (!post) return res.status(404).json({ message: '作品不存在' });
    const targetUrl = body?.postUrl || post.postUrl;
    if (!targetUrl) return res.status(400).json({ message: '请先填写作品链接' });
    try {
      const metrics = await this.postsMetricsService.fetchMetricsFromUrl(targetUrl);
      await this.postsService.updateMetrics(id, metrics);
      await this.postsService.recordMetricsHistory(id, metrics);
      try {
        await this.operationLogs.log({
          userId: getSessionUserId(req),
          action: OPERATION_LOG_ACTIONS.UPDATE,
          targetType: OPERATION_LOG_TARGET_TYPES.POST,
          targetId: id,
          detail: stringifyDetail({
            source: 'refresh-metrics',
            refreshedFields: ['likes', 'comments', 'favorites', 'shares'],
          }),
          ip: parseIp(req),
        });
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('[posts] refresh-metrics op log failed', (logErr as any)?.message || logErr);
      }
      return res.json({ ok: true, metrics });
    } catch (error: any) {
      return res.status(400).json({ ok: false, message: error.message || '刷新失败' });
    }
  }

  @Post('refresh-metrics')
  async refreshMetrics(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const postIds = Array.isArray(body?.postIds)
      ? body.postIds.map((id: any) => String(id || '').trim()).filter(Boolean)
      : [];
    const session = (req as any).session;
    const viewer = {
      viewerUserId: getSessionUserId(req),
      viewerRole: String(session?.role || '').toLowerCase(),
      viewerEmployeeId: session?.employeeId,
    };
    const posts = postIds.length
      ? await this.postsService.findByIds(postIds, viewer)
      : await this.postsService.findAll(viewer);
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
