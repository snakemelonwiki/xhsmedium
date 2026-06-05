import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, Res, Query, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { Request, Response } from 'express';
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
 * 与 users.controller.ts 同款内联校验，保持 controllers 间风格一致。
 */
function hasRole(role: string, allowed: string[]): boolean {
  return allowed.includes(role);
}

/** 员工状态白名单：与前端表单 value / schema.sql 默认值对齐 */
const EMPLOYEE_STATUS_VALUES = ['在职', '离职', '停用'] as const;
/**
 * 兼容历史 / 前端缓存：旧版表单可能用英文 code 提交
 * （active/inactive/disabled/enabled），写库前统一翻译成中文。
 * 不在白名单且未匹配英文别名的值回退到默认 '在职'。
 */
function normalizeEmployeeStatus(input: unknown): string {
  const raw = String(input ?? '').trim().normalize('NFC');
  if (!raw) return '在职';
  if ((EMPLOYEE_STATUS_VALUES as readonly string[]).includes(raw)) return raw;
  const alias: Record<string, string> = {
    active: '在职',
    enabled: '在职',
    online: '在职',
    inactive: '离职',
    disabled: '停用',
    leave: '离职',
    resign: '离职',
    stopped: '停用',
  };
  return alias[raw.toLowerCase()] ?? '在职';
}

/** 员工资料变更（创建/更新/删除/启停）仅 admin/owner/supervisor 可执行 */
function ensureEmployeeAdmin(req: Request, res: Response): boolean {
  const role = getSessionRole(req);
  if (!hasRole(role, ['admin', 'owner', 'supervisor'])) {
    res.status(403).json({ ok: false, message: 'forbidden: 仅 admin/supervisor 可管理员工资料' });
    return false;
  }
  return true;
}

/** 登录角色白名单：与 user.entity.ts enum 对齐 */
const LOGIN_ROLE_VALUES = ['operation', 'sales', 'academic', 'admin', 'supervisor', 'staff', 'owner'] as const;

@Controller('employees')
// B/P0-05: 整个 employees 控制器在未带 Bearer token 时必须直接 401，
// 不允许未登录用户拉全表或修改员工资料。AuthGuard 内部已做 token 校验。
@UseGuards(AuthGuard)
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  /**
   * 查询员工详情。
   * 仅 admin/supervisor/owner 可访问。
   */
  @Get(':id')
  async findById(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;
    const employee = await this.employeesService.findById(id);
    if (!employee) {
      return res.status(404).json({ ok: false, message: '员工不存在' });
    }
    return res.json(employee);
  }

  /**
   * 查询员工列表，支持分页和关键字过滤。
   * 员工列表包含组织人员信息，仅 admin/owner 可读。
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
  ) {
    if (!ensureEmployeeAdmin(req, res)) return;
    const wantsPaging = limit !== undefined || offset !== undefined;
    const nextKeyword = keyword || search || q || '';
    if (wantsPaging) {
      const result = await this.employeesService.findAllPaged(
        Number(limit) || 20,
        Number(offset) || 0,
        nextKeyword,
      );
      return res.json(result);
    }
    const rows = await this.employeesService.findAll(nextKeyword);
    return res.json(rows);
  }

  /**
   * 创建员工 + 自动生成登录账号（B 端 1.2 P0-A5 修复）。
   *
   * Body 字段：
   *   - name             必填
   *   - phone            可选
   *   - hireDate         可选 (YYYY-MM-DD)
   *   - status           可选，默认 '在职'
   *   - loginUsername    可选；缺省时自动生成 (name_手机号后4位)
   *   - loginPassword    可选；缺省时自动生成 (8~12 位大小写+数字)
   *   - loginRole        可选；缺省 'operation'
   *   - createLoginAccount 可选 boolean；缺省 true
   *
   * 响应：
   *   {
   *     ok: true,
   *     employee: {...},
   *     loginAccount: { userId, username, role, initialPassword } | null
   *   }
   *
   * initialPassword 仅在创建时返回一次（不落库明文）。
   */
  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;

    try {
      const userId = getSessionUserId(req);
      const allCodes = await this.employeesService.findAllCodes();
      const maxNum = allCodes.length === 0 ? 0 : Math.max(...allCodes.map((c) => Number(String(c).replace('EMP', '')) || 0));
      const employeeCode = `EMP${String(maxNum + 1).padStart(4, '0')}`;

      // 校验 loginRole（若提供）
      const nextRole = body.loginRole !== undefined && body.loginRole !== null
        ? String(body.loginRole).trim()
        : undefined;
      if (nextRole && !(LOGIN_ROLE_VALUES as readonly string[]).includes(nextRole)) {
        return res.status(400).json({ ok: false, message: `loginRole 不合法: ${nextRole}` });
      }

      // createLoginAccount 默认 true（除非显式 false）
      const createLoginAccount = body.createLoginAccount === false ? false : true;

      const result = await this.employeesService.createWithLogin(employeeCode, {
        name: body.name,
        phone: body.phone || null,
        hireDate: body.hireDate || null,
        status: normalizeEmployeeStatus(body.status),
        loginUsername: body.loginUsername || null,
        loginPassword: body.loginPassword || null,
        loginRole: nextRole,
        createLoginAccount,
        actorUserId: userId,
      });

      // 写操作日志：员工创建
      try {
        await this.operationLogs.log({
          userId,
          action: OPERATION_LOG_ACTIONS.CREATE,
          targetType: OPERATION_LOG_TARGET_TYPES.EMPLOYEE,
          targetId: (result.employee as any)?.id || '',
          detail: stringifyDetail({
            employeeCode,
            name: body.name,
            createdLoginAccount: !!result.loginAccount,
            username: result.loginAccount?.username,
            role: result.loginAccount?.role,
          }),
          ip: parseIp(req),
        });
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('[employees] operation log failed', (logErr as any)?.message || logErr);
      }
      return res.json({
        ok: true,
        employee: result.employee,
        loginAccount: result.loginAccount,
      });
    } catch (err: any) {
      if (err.status) throw err;
      console.error('[employees.create] unexpected error:', err.message || err);
      return res.status(500).json({ ok: false, message: 'Internal server error' });
    }
  }

  /**
   * 更新员工启停状态。
   * - 当目标 status 属于"离职/停用"语义时，写一条 DISABLE 操作日志；
   * - 普通 status 变更（在职/试用期 等）按 UPDATE 记录。
   * - E/P1-01+A5: 离职/停用时同步停用关联 user.status='inactive'。
   */
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;
    const userId = getSessionUserId(req);
    const before = await this.employeesService.findById(id);
    const nextStatus = normalizeEmployeeStatus(body.status);
    const isDisable = ['离职', '停用', 'inactive', 'disabled', '离职员工'].includes(nextStatus);
    try {
      if (isDisable) {
        await this.employeesService.softDelete(id);
      } else {
        await this.employeesService.updateStatus(id, nextStatus);
      }
    } catch (err: any) {
      if (err.status === 404) {
        return res.status(404).json({ ok: false, message: '员工不存在' });
      }
      throw err;
    }
    try {
      await this.operationLogs.log({
        userId,
        action: isDisable ? OPERATION_LOG_ACTIONS.DISABLE : OPERATION_LOG_ACTIONS.UPDATE,
        targetType: OPERATION_LOG_TARGET_TYPES.EMPLOYEE,
        targetId: id,
        detail: stringifyDetail({
          from: before?.status || null,
          to: nextStatus || null,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[employees] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }

  /**
   * 更新员工资料。
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.updateEmployee(id, body, req, res);
  }

  /**
   * 兼容 PATCH 方式更新员工资料。
   */
  @Patch(':id')
  async patch(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.updateEmployee(id, body, req, res);
  }

  /**
   * 删除员工，保持现有服务删除策略。
   * E/P1-01+A5: 删除等同软删除（停用员工 + 同步停用关联 user），
   * 不物理删除 employee。
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;
    const userId = getSessionUserId(req);
    const before = await this.employeesService.findById(id);
    if (!before) {
      return res.status(404).json({ ok: false, message: '员工不存在' });
    }
    try {
      await this.employeesService.softDelete(id);
    } catch (err: any) {
      if (err.status === 404) {
        return res.status(404).json({ ok: false, message: '员工不存在' });
      }
      throw err;
    }
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.DELETE,
        targetType: OPERATION_LOG_TARGET_TYPES.EMPLOYEE,
        targetId: id,
        detail: stringifyDetail({
          employeeCode: before?.employeeCode || null,
          name: before?.name || null,
          softDelete: true,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[employees] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }

  /**
   * 执行员工资料更新，供 PUT/PATCH 复用。
   * B 端 1.2 P0-A5 修复：若 body 含 loginPassword / loginRole，则同步更新关联 user。
   */
  private async updateEmployee(id: string, body: any, req: Request, res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;
    const userId = getSessionUserId(req);

    // loginRole 校验
    if (body.loginRole !== undefined && body.loginRole !== null && String(body.loginRole).length > 0) {
      const nextRole = String(body.loginRole).trim();
      if (!(LOGIN_ROLE_VALUES as readonly string[]).includes(nextRole)) {
        return res.status(400).json({ ok: false, message: `loginRole 不合法: ${nextRole}` });
      }
    }

    try {
      await this.employeesService.updateWithLogin(id, {
        name: body.name,
        phone: body.phone || null,
        hireDate: body.hireDate || null,
        status: normalizeEmployeeStatus(body.status),
        department: body.department || null,
        loginPassword: body.loginPassword || null,
        loginRole: body.loginRole || null,
      });
    } catch (err: any) {
      if (err.status === 404) {
        return res.status(404).json({ ok: false, message: '员工不存在' });
      }
      throw err;
    }
    // 写操作日志：员工更新
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.UPDATE,
        targetType: OPERATION_LOG_TARGET_TYPES.EMPLOYEE,
        targetId: id,
        detail: stringifyDetail({
          name: body.name,
          // 日志保留原始提交值，便于审计 / 排查前端脏数据来源；
          // 实际写入 employees.status 已通过 normalizeEmployeeStatus 规整。
          status: body.status,
          loginPasswordChanged: !!body.loginPassword,
          loginRoleChanged: !!body.loginRole,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[employees] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }
}
