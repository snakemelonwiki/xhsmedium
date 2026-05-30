import { Controller, Get, Param, Req, Res, Query } from '@nestjs/common';
import { OperationLogsService } from './operation-logs.service';
import { Request, Response } from 'express';

@Controller('operation-logs')
export class OperationLogsController {
  constructor(private readonly service: OperationLogsService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('userId') userId?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = Number(limit) || 50;
    const offsetNum = Number(offset) || 0;
    const rows = await this.service.list({
      userId,
      targetType,
      targetId,
      action,
      from,
      to,
      limit: limitNum,
      offset: offsetNum,
    });
    return res.json({ ...rows, limit: limitNum, offset: offsetNum });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const row = await this.service.findOne(id);
    if (!row) {
      return res.status(404).json({ message: '操作日志不存在' });
    }
    return res.json(row);
  }
}
