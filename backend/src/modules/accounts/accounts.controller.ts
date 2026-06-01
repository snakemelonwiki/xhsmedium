import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, Res } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  @Get()
  async findAll(
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('keyword') keyword?: string,
    @Query('search') search?: string,
    @Query('q') q?: string,
    @Query('platform') platform?: string,
  ) {
    const wantsPaging = limit !== undefined || offset !== undefined;
    const nextKeyword = keyword || search || q || '';
    const nextPlatform = (platform || '').trim();
    if (wantsPaging) {
      const result = await this.accountsService.findAllPaged(
        Number(limit) || 20,
        Number(offset) || 0,
        nextKeyword,
        nextPlatform,
      );
      return res.json(result);
    }
    // findAll() 已经返回完整 mapAccount 输出（含 employeeName），直接透传即可
    const rows = await this.accountsService.findAll(nextKeyword, nextPlatform);
    return res.json(rows);
  }

  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId = session?.userId || session?.id || '';
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

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const userId = session?.userId || session?.id || '';
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

  @Put(':id/posting-plan')
  async updatePostingPlan(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    await this.accountsService.updatePostingPlan(id, body.postingPlan);
    return res.json({ ok: true });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.accountsService.remove(id);
    return res.json({ ok: true });
  }
}
