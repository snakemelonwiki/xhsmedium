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
  const raw = String(input ?? '').trim();
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

/** 员工资料变更（创建/更新/删除/启停）仅 admin/owner 可执行 */
function ensureEmployeeAdmin(req: Request, res: Response): boolean {
  const role = getSessionRole(req);
  if (!hasRole(role, ['admin', 'owner'])) {
    res.status(403).json({ ok: false, message: 'forbidden: 仅 admin/owner 可管理员工资料' });
    return false;
  }
  return true;
}

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
   * 创建员工并自动生成员工编号。
   */
  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;

    const userId = getSessionUserId(req);
    const allCodes = await this.employeesService.findAllCodes();
    const maxNum = allCodes.length === 0 ? 0 : Math.max(...allCodes.map((c) => Number(String(c).replace('EMP', '')) || 0));
    const employeeCode = `EMP${String(maxNum + 1).padStart(4, '0')}`;
    const employee = await this.employeesService.create({
      employeeCode,
      name: body.name,
      phone: body.phone || null,
      hireDate: body.hireDate || null,
      status: normalizeEmployeeStatus(body.status),
    });
    // 写操作日志：员工创建
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.CREATE,
        targetType: OPERATION_LOG_TARGET_TYPES.EMPLOYEE,
        targetId: (employee as any)?.id || '',
        detail: stringifyDetail({
          employeeCode,
          name: body.name,
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
   * 更新员工启停状态。
   * - 当目标 status 属于"离职/停用"语义时，写一条 DISABLE 操作日志；
   * - 普通 status 变更（在职/试用期 等）按 UPDATE 记录。
   */
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;
    const userId = getSessionUserId(req);
    const before = await this.employeesService.findById(id);
    await this.employeesService.updateStatus(id, body.status);
    // E/P1-01: 把"停用/离职"这类 status 变更归到 OPERATION_LOG_ACTIONS.DISABLE，
    // 其余 status 变更（在职/试用期 等）按 UPDATE 记录。
    const nextStatus = String(body.status || '').trim();
    const isDisable = ['离职', '停用', 'inactive', 'disabled', '离职员工'].includes(nextStatus);
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
   * E/P1-01: 写一条 DELETE 操作日志（targetType=employee），与 accounts/leads 保持口径一致。
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;
    const userId = getSessionUserId(req);
    const before = await this.employeesService.findById(id);
    await this.employeesService.remove(id);
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.DELETE,
        targetType: OPERATION_LOG_TARGET_TYPES.EMPLOYEE,
        targetId: id,
        detail: stringifyDetail({
          employeeCode: before?.employeeCode || null,
          name: before?.name || null,
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
   */
  private async updateEmployee(id: string, body: any, req: Request, res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;
    const userId = getSessionUserId(req);
    await this.employeesService.update(id, {
      name: body.name,
      phone: body.phone || null,
      hireDate: body.hireDate || null,
      status: normalizeEmployeeStatus(body.status),
    });
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
