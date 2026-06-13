import { Controller, Get, Post, Body, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { PlazaConfigService } from './plaza-config.service';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionRole } from '../../common/session.utils';

@Controller('plaza-config')
@UseGuards(AuthGuard)
export class PlazaConfigController {
  constructor(private readonly plazaConfigService: PlazaConfigService) {}

  @Get()
  async getConfig(@Res() res: Response) {
    const config = await this.plazaConfigService.getConfig();
    return res.json({ ok: true, config });
  }

  @Post()
  async saveConfig(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const role = getSessionRole(req);
    if (!['admin', 'owner', 'supervisor'].includes(role)) {
      return res.status(403).json({ ok: false, message: '仅管理员/主管可配置' });
    }
    await this.plazaConfigService.saveConfig(body);
    return res.json({ ok: true, message: '配置已保存' });
  }
}