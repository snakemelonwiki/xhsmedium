import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { Request, Response } from 'express';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionUserId, getSessionRole } from '../../common/session.utils';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { Repository } from 'typeorm';

@Controller('sales')
@UseGuards(AuthGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 销售首页六宫格数据。
   * 仅 sales 角色可访问，只能查看本人的数据。
   */
  @Get('home-summary')
  async getHomeSummary(@Req() req: Request, @Res() res: Response) {
    const role = getSessionRole(req);
    if (role !== 'sales') {
      return res.status(403).json({ ok: false, message: 'forbidden: 仅销售可访问此接口' });
    }
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }
    const summary = await this.salesService.getHomeSummary(userId);
    return res.json(summary);
  }
}
