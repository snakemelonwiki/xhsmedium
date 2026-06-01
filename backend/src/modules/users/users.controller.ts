import { Controller, Get, Post, Body, Req, Res, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  @Get()
  async findAll(
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.usersService.findAllPaged({
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      });
      return res.json(result);
    }
    const users = await this.usersService.findAll();
    return res.json(users.map((u) => ({
      id: u.id,
      username: u.username,
      password: u.password,
      role: u.role,
      employeeId: u.employeeId,
      status: u.status,
    })));
  }

  @Get('staff')
  async findStaffUsers(
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.usersService.findStaffUsersPaged({
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      });
      return res.json(result);
    }
    const users = await this.usersService.findStaffUsers();
    return res.json(users.map((u) => ({
      id: u.id,
      username: u.username,
      password: u.password,
      role: u.role,
      employeeId: u.employeeId,
      status: u.status,
    })));
  }

  @Post('staff')
  async createStaff(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId = session?.userId || session?.id || '';
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
    return res.json({ ok: true });
  }
}
