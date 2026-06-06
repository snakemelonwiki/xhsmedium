import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionUserId, getSessionRole } from '../../common/session.utils';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

/**
 * 检查当前 session 角色是否在白名单中。
 * 主管（supervisor）与 admin 均可管理账号。
 */
function hasRole(role: string, allowed: string[]): boolean {
  return allowed.includes(role);
}

/** 账号管理（创建/启停用）仅 admin/supervisor 可执行 */
function ensureAccountManager(req: Request, res: Response): boolean {
  const role = getSessionRole(req);
  if (!hasRole(role, ['admin', 'owner', 'supervisor'])) {
    res.status(403).json({ ok: false, message: 'forbidden: 仅 admin/supervisor 可管理账号' });
    return false;
  }
  return true;
}

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  /**
   * 查询账号详情。
   * 运营角色只能查看本人名下账号。
   */
  @Get(':id')
  async findById(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const scopedEmployeeId = this.resolveScopedEmployeeId(req);
    const account = await this.accountsService.findById(id);
    if (!account) {
      return res.status(404).json({ ok: false, message: '账号不存在' });
    }
    // 运营角色只能查看本人名下账号
    if (scopedEmployeeId !== undefined && account.employeeId !== scopedEmployeeId) {
      return res.status(403).json({ ok: false, message: '无权查看该账号' });
    }
    return res.json(account);
  }

  /**
   * 查询账号列表，运营角色仅返回本人名下账号，支持按平台过滤。
   */
  @Get()
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('keyword') keyword?: string,
    @Query('search') search?: string,
    @Query('q') q?: string,
    @Query('platform') platform?: string,
    @Query('id') id?: string,
  ) {
    const wantsPaging = limit !== undefined || offset !== undefined;
    const nextKeyword = keyword || search || q || '';
    const nextPlatform = (platform || '').trim();
    const scopedEmployeeId = this.resolveScopedEmployeeId(req);
    // 精准按主键查一条（学习榜单等深链 ?id=xxx 场景）；不走 search 模糊匹配
    if (id) {
      const result = await this.accountsService.findByIdForPaged(id, scopedEmployeeId);
      return res.json(result);
    }
    if (wantsPaging) {
      const result = await this.accountsService.findAllPaged(
        Number(limit) || 20,
        Number(offset) || 0,
        nextKeyword,
        nextPlatform,
        scopedEmployeeId,
      );
      return res.json(result);
    }
    const rows = await this.accountsService.findAll(nextKeyword, nextPlatform, scopedEmployeeId);
    // findAll() 已经返回完整 mapAccount 输出（含 employeeName），直接透传即可
    return res.json(rows);
  }

  /**
   * 创建账号资料，仅主管可创建。
   */
  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!ensureAccountManager(req, res)) return;
    const userId = getSessionUserId(req);
    const account = await this.accountsService.create({
      id: makeId(),
      employeeId: body.employeeId,
      platform: body.platform,
      profileUrl: body.profileUrl,
      accountName: body.accountName,
      accountUid: body.accountUid,
      persona: body.persona,
      positioning: body.positioning,
      postingPlan: body.postingPlan || '',
      status: body.status || '正常',
    });
    // 写操作日志：账号创建
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.CREATE,
        targetType: OPERATION_LOG_TARGET_TYPES.ACCOUNT,
        targetId: (account as any)?.id || '',
        detail: stringifyDetail({
          platform: body.platform,
          accountName: body.accountName,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[accounts] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }

  /**
   * 更新账号启停状态，仅主管可执行。
   * E/P1-01: 把"停用/异常/注销"类 status 变更归到 OPERATION_LOG_ACTIONS.DISABLE，
   * 其余 status 变更（正常/封禁 等）按 UPDATE 记录。
   */
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!ensureAccountManager(req, res)) return;
    const denied = await this.ensureCanWriteAccount(id, body, req, res);
    if (denied) return denied;
    const userId = getSessionUserId(req);
    const before = await this.accountsService.findById(id);
    await this.accountsService.updateStatus(id, body.status);
    const nextStatus = String(body.status || '').trim();
    const isDisable = ['停用', '异常', '注销', 'inactive', 'disabled', '封禁', 'banned'].includes(nextStatus);
    try {
      await this.operationLogs.log({
        userId,
        action: isDisable ? OPERATION_LOG_ACTIONS.DISABLE : OPERATION_LOG_ACTIONS.UPDATE,
        targetType: OPERATION_LOG_TARGET_TYPES.ACCOUNT,
        targetId: id,
        detail: stringifyDetail({
          from: before?.status || null,
          to: nextStatus || null,
          accountName: before?.accountName || null,
          platform: before?.platform || null,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[accounts] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }

  /**
   * 更新账号资料，运营角色只能修改本人名下账号。
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.updateAccount(id, body, req, res);
  }

  /**
   * 兼容 PATCH 方式更新账号资料。
   */
  @Patch(':id')
  async patch(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.updateAccount(id, body, req, res);
  }

  /**
   * 更新账号发布计划。
   * 运营角色只能修改本人名下账号。
   */
  @Put(':id/posting-plan')
  async updatePostingPlan(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const denied = await this.ensureCanWriteAccount(id, body, req, res);
    if (denied) return denied;
    await this.accountsService.updatePostingPlan(id, body.postingPlan);
    return res.json({ ok: true });
  }

  /**
   * 删除账号。
   * 运营角色只能删除本人名下账号。
   * E/P1-01: 写一条 DELETE 操作日志（targetType=account），与 leads/employees 保持口径一致。
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const denied = await this.ensureCanWriteAccount(id, {}, req, res);
    if (denied) return denied;
    const userId = getSessionUserId(req);
    const before = await this.accountsService.findById(id);
    await this.accountsService.remove(id);
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.DELETE,
        targetType: OPERATION_LOG_TARGET_TYPES.ACCOUNT,
        targetId: id,
        detail: stringifyDetail({
          accountName: before?.accountName || null,
          platform: before?.platform || null,
          employeeId: before?.employeeId || null,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[accounts] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }

  /**
   * 执行账号资料更新并复用写权限校验。
   */
  private async updateAccount(id: string, body: any, req: Request, res: Response) {
    const userId = getSessionUserId(req);
    const denied = await this.ensureCanWriteAccount(id, body, req, res);
    if (denied) return denied;
    await this.accountsService.update(id, {
      employeeId: body.employeeId,
      platform: body.platform,
      profileUrl: body.profileUrl,
      accountName: body.accountName,
      accountUid: body.accountUid,
      persona: body.persona,
      positioning: body.positioning,
      postingPlan: body.postingPlan,
      status: body.status,
    });
    // 写操作日志：账号更新
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.UPDATE,
        targetType: OPERATION_LOG_TARGET_TYPES.ACCOUNT,
        targetId: id,
        detail: stringifyDetail({
          platform: body.platform,
          accountName: body.accountName,
          status: body.status,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[accounts] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }

  /**
   * 校验当前请求是否只能访问某个员工名下账号。
   */
  private resolveScopedEmployeeId(req: Request): string | undefined {
    const session = (req as any)?.session || {};
    if (session.role === 'staff' || session.role === 'operation') {
      return session.employeeId || '';
    }
    return undefined;
  }

  /**
   * 校验运营角色写账号时不能越过本人 employeeId。
   */
  private async ensureCanWriteAccount(id: string, body: any, req: Request, res: Response) {
    const scopedEmployeeId = this.resolveScopedEmployeeId(req);
    if (scopedEmployeeId === undefined) return null;
    const account = await this.accountsService.findById(id);
    if (!account) {
      return res.status(404).json({ ok: false, message: '账号不存在' });
    }
    if (account.employeeId !== scopedEmployeeId || (body.employeeId !== undefined && body.employeeId !== scopedEmployeeId)) {
      return res.status(403).json({ ok: false, message: '无权修改该账号' });
    }
    return null;
  }
}
