import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ExportsService, ExportType } from './exports.service';

const ALLOWED_TYPES: ExportType[] = [
  'leads',
  'orders',
  'collaboration_records',
  'posts',
  'rankings',
];

// 按角色限制可触发的 exportType，防止低权限角色下载全公司数据。
//   admin / owner：所有类型
//   staff（运营）：作品、客资、协同记录、排行榜
//   sales：客资（仅自己的）、订单、协同记录
//   academic：仅订单（仅自己的+池单）
const ROLE_EXPORT_WHITELIST: Record<string, ExportType[]> = {
  admin:    ['leads', 'orders', 'collaboration_records', 'posts', 'rankings'],
  owner:    ['leads', 'orders', 'collaboration_records', 'posts', 'rankings'],
  staff:    ['leads', 'posts', 'rankings', 'collaboration_records'],
  sales:    ['leads', 'orders', 'collaboration_records'],
  academic: ['orders'],
};

@Controller('exports')
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

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
    const userId = session?.userId || session?.id || '';
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
      // admin / owner 默认 scope=all（看全量），其它角色默认 scope=mine。
      delete raw.role;
      delete raw.currentUserId;
      delete raw.actorUserId;
      delete raw.actorRole;
      delete raw._userRole;
      if (raw.scope === 'all' && userRole !== 'admin' && userRole !== 'owner') {
        delete raw.scope;
      }
      const filter: Record<string, any> = {
        ...raw,
        role: userRole,
        currentUserId: userId,
        scope: raw.scope || (userRole === 'admin' || userRole === 'owner' ? 'all' : 'mine'),
        _userRole: userRole,
      };
      const result = await this.service.create({
        userId,
        userRole,
        exportType,
        filterJson: filter,
      });
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
    const userId = session?.userId || session?.id || actorUserId || '';
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
    const userId = session?.userId || session?.id || '';
    const role = session?.role || '';
    const task = await this.service.findOne(id);
    if (!task) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    // admin / owner 可看全部，其它角色只能看自己创建的导出任务
    const isAdminLike = role === 'admin' || role === 'owner';
    if (!isAdminLike && task.userId && task.userId !== userId) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    return res.json(task);
  }
}
