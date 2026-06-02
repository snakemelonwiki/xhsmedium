import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, Res, Query, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { Request, Response } from 'express';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { AuthGuard } from '../../common/auth.guard';
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
function hasRole(session: any, allowed: string[]): boolean {
  const role = String(session?.role || '').toLowerCase();
  return allowed.includes(role);
}

/** 员工资料变更（创建/更新/删除/启停）仅 admin/owner 可执行 */
function ensureEmployeeAdmin(req: Request, res: Response): boolean {
  const session = (req as any).session;
  if (!hasRole(session, ['admin', 'owner'])) {
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
   * 所有已登录用户可读（用于改派/分配等场景的展示），employees 表无 password 字段。
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

    const session = (req as any).session;
    const userId = session?.userId || session?.id || '';
    const allCodes = await this.employeesService.findAllCodes();
    const maxNum = allCodes.length === 0 ? 0 : Math.max(...allCodes.map((c) => Number(String(c).replace('EMP', '')) || 0));
    const employeeCode = `EMP${String(maxNum + 1).padStart(4, '0')}`;
    const employee = await this.employeesService.create({
      employeeCode,
      name: body.name,
      phone: body.phone || null,
      hireDate: body.hireDate || null,
      status: body.status || '在职',
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
   */
  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;
    await this.employeesService.updateStatus(id, body.status);
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
   */
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;
    await this.employeesService.remove(id);
    return res.json({ ok: true });
  }

  /**
   * 执行员工资料更新，供 PUT/PATCH 复用。
   */
  private async updateEmployee(id: string, body: any, req: Request, res: Response) {
    if (!ensureEmployeeAdmin(req, res)) return;
    const session = (req as any).session;
    const userId = session?.userId || session?.id || '';
    await this.employeesService.update(id, {
      name: body.name,
      phone: body.phone || null,
      hireDate: body.hireDate || null,
      status: body.status,
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
