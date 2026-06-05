import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ExportsService, ExportType } from './exports.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { getSessionUserId } from '../../common/session.utils';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

const ALLOWED_TYPES: ExportType[] = [
  'leads',
  'orders',
  'order_progress',
  'collaboration_records',
  'posts',
  'rankings',
  'accounts',
];

// 按角色限制可触发的 exportType，防止低权限角色下载全公司数据。
//   admin / owner / supervisor：所有类型（v1.3 主管端导出权限等同 admin，
//                                见 BF-SUPERVISOR-EXPORT 修复说明）
//   staff（运营）：作品、账号、客资、协同记录、排行榜
//   sales：客资（仅自己的）、订单、订单跟进、协同记录
//   academic：订单、订单跟进（仅自己的+池单）
const ROLE_EXPORT_WHITELIST: Record<string, ExportType[]> = {
  admin:      ['leads', 'orders', 'order_progress', 'collaboration_records', 'posts', 'rankings', 'accounts'],
  owner:      ['leads', 'orders', 'order_progress', 'collaboration_records', 'posts', 'rankings', 'accounts'],
  supervisor: ['leads', 'orders', 'order_progress', 'collaboration_records', 'posts', 'rankings', 'accounts'],
  staff:      ['leads', 'posts', 'rankings', 'collaboration_records', 'accounts'],
  sales:      ['leads', 'orders', 'order_progress', 'collaboration_records'],
  academic:   ['orders', 'order_progress'],
};

@Controller('exports')
export class ExportsController {
  constructor(
    private readonly service: ExportsService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  /**
   * 创建一个异步导出任务。
   *   body: { exportType, filter? }
   * filter 原样落库（filter_json）并在生成时透传给具体导出器；
   * 但角色 / 用户 ID / 默认 scope 由服务端从 session 注入，调用方传的 actorRole/role
   * 等同名字段会被覆盖，避免越权下载全公司数据。
   */
  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId = getSessionUserId(req);
    const userRole = session?.role || '';
    if (!userId || !userRole) {
      return res.status(401).json({ ok: false, message: 'unauthorized' });
    }
    const exportType = body?.exportType as ExportType;
    if (!ALLOWED_TYPES.includes(exportType)) {
      return res.status(422).json({ ok: false, message: 'invalid exportType' });
    }
    const allowed = ROLE_EXPORT_WHITELIST[userRole] || [];
    if (!allowed.includes(exportType)) {
      return res.status(403).json({ ok: false, message: 'forbidden exportType' });
    }
    try {
      const raw = (body?.filter && typeof body.filter === 'object') ? { ...body.filter } : {};
      // 强制覆盖：客户端传来的 role / currentUserId / actorUserId / scope=all 一律忽略。
      // admin / owner / supervisor 默认 scope=all（看全量）— v1.3 BF-SUPERVISOR-EXPORT：
      //   主管端权限等同 admin，可看全量数据。
      //   其它角色默认 scope=mine。
      delete raw.role;
      delete raw.currentUserId;
      delete raw.actorUserId;
      delete raw.actorRole;
      delete raw._userRole;
      const isAdminLikeRole =
        userRole === 'admin' || userRole === 'owner' || userRole === 'supervisor';
      if (raw.scope === 'all' && !isAdminLikeRole) {
        delete raw.scope;
      }
      const filter: Record<string, any> = {
        ...raw,
        role: userRole,
        currentUserId: userId,
        currentEmployeeId: session?.employeeId || '',
        scope: raw.scope || (isAdminLikeRole ? 'all' : 'mine'),
        _userRole: userRole,
      };
      const result = await this.service.create({
        userId,
        userRole,
        exportType,
        filterJson: filter,
      });
      // 写操作日志：导出任务创建（best-effort）
      try {
        await this.operationLogs.log({
          userId,
          action: OPERATION_LOG_ACTIONS.EXPORT_CREATE,
          targetType: OPERATION_LOG_TARGET_TYPES.EXPORT_TASK,
          targetId: result.id,
          detail: stringifyDetail({
            exportType,
            scope: filter.scope,
            role: userRole,
          }),
          ip: parseIp(req),
        });
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('[exports] operation log failed', (logErr as any)?.message || logErr);
      }
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err?.message || String(err) });
    }
  }

  @Get()
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const userId = getSessionUserId(req) || actorUserId || '';
    // 任一存在 → 走 paged → 返回对象；否则数组（兼容旧前端）
    if (limit !== undefined || offset !== undefined) {
      const paged = await this.service.listForUserPaged(
        userId,
        type || undefined,
        Number(limit) || 20,
        Number(offset) || 0,
      );
      return res.json(paged);
    }
    const rows = await this.service.listForUser(userId, type || undefined);
    return res.json(rows);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId = getSessionUserId(req);
    const role = session?.role || '';
    const task = await this.service.findOne(id);
    if (!task) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    // admin / owner / supervisor 可看全部，其它角色只能看自己创建的导出任务
    // v1.3 BF-SUPERVISOR-EXPORT：supervisor 权限等同 admin。
    const isAdminLike = role === 'admin' || role === 'owner' || role === 'supervisor';
    if (!isAdminLike && task.userId && task.userId !== userId) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    return res.json(task);
  }

  /**
   * 下载已完成的导出文件。
   * - 权限：仅任务创建者可下载；admin / owner / supervisor 可下载全部
   *   （v1.3 BF-SUPERVISOR-EXPORT：supervisor 权限等同 admin）
   * - 状态：仅 status === 'completed' 可下载
   * - 写 operation_logs（action='export_download'）
   * - 不发送通知（与 BF-SUPERVISOR-EXPORT 一致：导出完成 = 直接下载文件）
   */
  @Get(':id/download')
  async download(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId = getSessionUserId(req);
    const role = session?.role || '';
    if (!userId || !role) {
      return res.status(401).json({ ok: false, message: 'unauthorized' });
    }
    const result: any = await this.service.resolveDownload(id, userId, role);
    if (!result || result.ok !== true) {
      return res.status(result?.status || 400).json({ ok: false, message: result?.message || 'download_failed' });
    }
    // 写下载日志（不影响主流程）
    void this.service.logDownload({
      taskId: id,
      userId,
      role,
      exportType: result.exportType,
      ip: this.getClientIp(req),
    }).catch(() => {
      // ignore
    });
    const filename = this.buildDownloadFilename(result.exportType, id, result.ext);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(result.fileSize));
    // 优先 stream 本地文件；OSS 模式下 redirect 到签名 URL
    if (result.redirectUrl) {
      return res.redirect(result.redirectUrl);
    }
    return res.sendFile(result.filePath);
  }

  private buildDownloadFilename(exportType: string, id: string, ext: string): string {
    // 文件名里加 exportType 前缀 + taskId 前 8 位，便于辨识
    const short = (id || '').slice(0, 8);
    const safeType = String(exportType || 'export').replace(/[^a-zA-Z0-9_\-]/g, '');
    return `${safeType}_${short}.${ext}`;
  }

  private getClientIp(req: Request): string {
    const xff = (req.headers['x-forwarded-for'] as string) || '';
    if (xff) return xff.split(',')[0].trim();
    return (req.socket as any)?.remoteAddress || (req as any).ip || '';
  }
}
