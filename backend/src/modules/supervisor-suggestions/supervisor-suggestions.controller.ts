import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { SupervisorSuggestionsService } from './supervisor-suggestions.service';

@Controller('supervisor-suggestions')
export class SupervisorSuggestionsController {
  constructor(private readonly service: SupervisorSuggestionsService) {}

  /**
   * 创建主管建议，当前版本优先支持作品建议落库。
   */
  @Post()
  async create(@Body() body: any, @Res() res: Response) {
    try {
      const data = await this.service.create({
        targetType: body?.targetType,
        targetId: body?.targetId,
        content: body?.content || body?.suggestion || body?.supervisorSuggestion,
      });
      return res.json({ ok: true, data });
    } catch (error: any) {
      return res.status(422).json({ ok: false, message: error?.message || '主管建议保存失败' });
    }
  }

  /**
   * 查询主管建议列表，支持按对象类型和员工过滤。
   */
  @Get()
  async list(
    @Res() res: Response,
    @Query('targetType') targetType?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const items = await this.service.list({ targetType, employeeId });
    return res.json({ items });
  }
}
