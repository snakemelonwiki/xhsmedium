import { Controller, Get, Post, Patch, Body, Param, Req, Res, Query, UseGuards } from '@nestjs/common';
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

/** 仅 admin / owner / supervisor 可访问用户账号管理。 */
function ensureAccountManager(req: Request, res: Response): boolean {
  const role = getSessionRole(req);
  if (!hasRole(role, ['admin', 'owner', 'supervisor'])) {
    res.status(403).json({ ok: false, message: 'forbidden: 仅 admin/supervisor 可访问用户账号' });
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

  /**
   * 查询当前用户的客资容量上限状态。
   * 必须在 @Get(':id') 之前声明，避免 'self' 被当作 id 参数匹配。
   */
  @Get('self/capacity')
  async getCapacity(@Req() req: Request, @Res() res: Response) {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }
    try {
      const result = await this.usersService.getCapacityStatus(userId);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(400).json({ ok: false, message: err?.message || '查询失败' });
    }
  }

  /**
   * 查询用户详情。
   */
  @Get(':id')
  async findById(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    if (!ensureAccountManager(req, res)) return;
    const user = await this.usersService.findById(id);
    if (!user) {
      return res.status(404).json({ ok: false, message: '用户不存在' });
    }
    // 过滤敏感字段后返回
    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  /**
   * 创建用户账号（通用创建接口）。
   * 仅 admin/owner/supervisor 可执行。
   */
  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!ensureAccountManager(req, res)) return;
    const userId = getSessionUserId(req);
    const { username, password, employeeId, status, role } = body;
    if (!username || !password) {
      return res.status(400).json({ message: '用户名和密码不能为空' });
    }
    const duplicated = await this.usersService.findByUsername(username);
    if (duplicated) {
      return res.status(400).json({ message: '用户名已存在' });
    }
    await this.usersService.create({
      username,
      password,
      employeeId: employeeId || null,
      status: status || 'active',
      role: role || 'staff',
    });
    // 写操作日志
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.CREATE,
        targetType: OPERATION_LOG_TARGET_TYPES.USER,
        targetId: '',
        detail: stringifyDetail({ username, employeeId, status: status || 'active', role: role || 'staff' }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[users] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }

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

  /**
   * 更新用户账号资料。
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!ensureAccountManager(req, res)) return;
    const userId = getSessionUserId(req);
    const before = await this.usersService.findById(id);
    if (!before) {
      return res.status(404).json({ message: '用户不存在' });
    }
    await this.usersService.update(id, {
      username: body.username,
      password: body.password,
      employeeId: body.employeeId,
      status: body.status,
      role: body.role,
    });
    // 写操作日志：用户更新
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.UPDATE,
        targetType: OPERATION_LOG_TARGET_TYPES.USER,
        targetId: id,
        detail: stringifyDetail({
          username: body.username,
          employeeId: body.employeeId,
          status: body.status,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[users] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }

  /**
   * 更新用户账号启停状态，停用时写操作日志。
   */
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!ensureAccountManager(req, res)) return;
    const userId = getSessionUserId(req);
    const before = await this.usersService.findById(id);
    if (!before) {
      return res.status(404).json({ message: '用户不存在' });
    }
    const nextStatus = String(body.status || '').trim();
    await this.usersService.updateStatus(id, nextStatus);
    // E/P1-01: 停用/锁定类 status 变更归到 DISABLE，其余按 UPDATE 记录
    const isDisable = ['inactive', 'disabled', 'locked', '停用', '锁定'].includes(nextStatus);
    try {
      await this.operationLogs.log({
        userId,
        action: isDisable ? OPERATION_LOG_ACTIONS.DISABLE : OPERATION_LOG_ACTIONS.UPDATE,
        targetType: OPERATION_LOG_TARGET_TYPES.USER,
        targetId: id,
        detail: stringifyDetail({
          from: before?.status || null,
          to: nextStatus || null,
          username: before?.username || null,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[users] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }

  /**
   * 切换当前销售用户的客资容量上限状态。
   * 仅 sales 角色可操作，其他人不可干预。
   */
  @Patch('self/capacity')
  async toggleCapacity(@Req() req: Request, @Res() res: Response) {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }
    try {
      const result = await this.usersService.toggleCapacityPaused(userId);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      const msg = err?.message || '操作失败';
      const status = msg.includes('不存在') ? 404 : msg.includes('仅销售') ? 403 : 400;
      return res.status(status).json({ ok: false, message: msg });
    }
  }

  @Patch('self/change-password')
  async changeSelfPassword(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }
    const { oldPassword, newPassword } = body || {};
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ ok: false, message: '请提供旧密码和新密码' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ ok: false, message: '新密码至少需要6个字符' });
    }
    if (!/[a-zA-Z]/.test(String(newPassword)) || !/[0-9]/.test(String(newPassword))) {
      return res.status(400).json({ ok: false, message: '新密码必须包含字母和数字' });
    }
    const user = await this.usersService.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, message: '用户不存在' });
    }
    // 验证旧密码（兼容 bcrypt 和明文）
    let oldPasswordValid = false;
    const storedPw = (user as any).password || '';
    if (storedPw.startsWith('$2b$') || storedPw.startsWith('$2a$')) {
      const bcrypt = await import('bcrypt');
      oldPasswordValid = await bcrypt.compare(String(oldPassword), storedPw);
    } else {
      oldPasswordValid = storedPw === String(oldPassword);
    }
    if (!oldPasswordValid) {
      return res.status(400).json({ ok: false, message: '旧密码不正确' });
    }
    // 存储新密码（明文）
    await this.usersService.updatePassword(userId, String(newPassword));
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.UPDATE,
        targetType: OPERATION_LOG_TARGET_TYPES.USER,
        targetId: userId,
        detail: stringifyDetail({ action: 'changeSelfPassword' }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      console.error('[users] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true, message: '密码修改成功' });
  }
}
