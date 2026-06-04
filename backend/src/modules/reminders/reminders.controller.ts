import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { AuthGuard } from '../../common/auth.guard';
import { RemindersService } from './reminders.service';
import type { CreateReminderDto } from './dto/create-reminder.dto';

/**
 * v1.3 CROSS-3 通用提醒 HTTP 入口。
 *
 * 路由（全局前缀 /api 由 main.ts 配置）：
 *   POST   /api/reminders                 新建提醒（销售/运营/主管互相提醒）
 *   GET    /api/reminders/unread-count    当前用户的未读提醒数
 *   PATCH  /api/reminders/:id/read        标记当前用户自己的某条提醒已读
 */
@Controller('reminders')
@UseGuards(AuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  async create(@Body() body: CreateReminderDto, @Req() req: Request, @Res() res: Response) {
    const result = await this.remindersService.createReminder(req, body);
    return res.json(result);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request, @Res() res: Response) {
    const result = await this.remindersService.getUnreadCount(req);
    return res.json(result);
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const result = await this.remindersService.markRead(req, id);
    return res.json(result);
  }

  /**
   * 回复提醒：对指定提醒发送回复。
   * POST /api/reminders/:id/reply
   * Body: { content: string }
   */
  @Post(':id/reply')
  async reply(
    @Param('id') id: string,
    @Body() body: { content: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.remindersService.reply(req, id, body);
    return res.json(result);
  }

  /**
   * 转发提醒：将指定提醒转发给另一个角色/用户。
   * POST /api/reminders/:id/forward
   * Body: { recipientId, recipientRole, content? }
   */
  @Post(':id/forward')
  async forward(
    @Param('id') id: string,
    @Body() body: { recipientId: string; recipientRole: string; content?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.remindersService.forward(req, id, body);
    return res.json(result);
  }
}
