import { Controller, Get, Post, Body, Req, Res, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
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
 * 用于 B/P0-05 修复：users/employees 控制器内部细粒度角色校验，
 * 避免引入未在仓库内使用过的 @Roles 装饰器（保持与 leads / exports / collab 一致的内联校验风格）。
 */
function hasRole(role: string, allowed: string[]): boolean {
  return allowed.includes(role);
}

/** 仅 admin / owner 可访问用户账号管理。 */
function ensureAccountManager(req: Request, res: Response): boolean {
  const role = getSessionRole(req);
  if (!hasRole(role, ['admin', 'owner'])) {
    res.status(403).json({ ok: false, message: 'forbidden: 仅 admin/owner 可访问用户账号' });
    return false;
  }
  return true;
}

@Controller('users')
// B/P0-05: 整个 users 控制器在未带 Bearer token 时必须直接 401，
// 不允许未登录用户拉全表 / 创建账号。AuthGuard 内部已做 token 校验。
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('role') role?: string,
  ) {
    if (role === 'sales') {
      const result = await this.usersService.findAssignableSalesUsersPaged({
        limit: Number(limit) || 200,
        offset: Number(offset) || 0,
      });
      return res.json(result);
    }

    // 仅 admin/owner 可查询完整用户列表（普通员工无需知晓全员账号）
    if (!ensureAccountManager(req, res)) return;

    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.usersService.findAllPaged({
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      });
      return res.json(result);
    }
    // service 层已统一 map 过滤 password，controller 无需再处理
    const users = await this.usersService.findAll();
    return res.json(users);
  }

  @Get('staff')
  async findStaffUsers(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!ensureAccountManager(req, res)) return;

    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.usersService.findStaffUsersPaged({
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      });
      return res.json(result);
    }
    const users = await this.usersService.findStaffUsers();
    return res.json(users);
  }

  @Post('staff')
  async createStaff(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    // B/P0-05: 创建账号属于高敏感操作，仅 admin/owner 可执行
    if (!ensureAccountManager(req, res)) return;

    const userId = getSessionUserId(req);
    const { username, password, employeeId, status } = body;
    const duplicated = await this.usersService.findByUsername(username);
    if (duplicated) {
      return res.status(400).json({ message: '用户名已存在' });
    }
    await this.usersService.upsertStaffUser({
      id: makeId(),
      username,
      password,
      employeeId,
      status: status || 'active',
    });
    // 写操作日志：用户/员工账号创建
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.CREATE,
        targetType: OPERATION_LOG_TARGET_TYPES.USER,
        targetId: '',
        detail: stringifyDetail({
          username,
          employeeId,
          status: status || 'active',
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[users] operation log failed', (logErr as any)?.message || logErr);
    }
    // E/P1-01: 账号创建过程中会接触到明文 password 字段，单独记一条 VIEW_SENSITIVE
    // 便于审计追溯哪些管理员经手过明文凭证。仅记录"是否含密码"和操作人，不落密码本身。
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.VIEW_SENSITIVE,
        targetType: OPERATION_LOG_TARGET_TYPES.USER,
        targetId: '',
        detail: stringifyDetail({
          username,
          hasPassword: Boolean(password),
          employeeId,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[users] view_sensitive log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }
}
