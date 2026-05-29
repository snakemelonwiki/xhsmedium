import { Controller, Post, Get, Req, Res, Body } from '@nestjs/common';
import { Request, Response } from 'express';

@Controller('tools')
export class ToolsController {
  constructor() {}

  @Post('fetch-metrics')
  async fetchMetrics(@Body() body: any, @Res() res: Response) {
    const url = String(body.url || '').trim();
    if (!url) return res.status(400).json({ message: '请先输入作品链接' });
    try {
      const { fetchMetricsFromUrl } = require('../../../metricsFetcher');
      const metrics = await fetchMetricsFromUrl(url);
      return res.json(metrics);
    } catch (error: any) {
      return res.status(400).json({ message: error.message || '抓取失败' });
    }
  }

  @Get('open-login-browser')
  @Post('open-login-browser')
  async openLoginBrowser(@Body() body: any, @Res() res: Response) {
    const platform = body.platform;
    try {
      const { openLoginBrowser } = require('../../../metricsFetcher');
      await openLoginBrowser(platform);
      return res.json({ ok: true });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || '打开登录浏览器失败' });
    }
  }

  @Post('seed-demo')
  async seedDemo(@Req() req: Request, @Res() res: Response) {
    return res.json({ ok: true, message: '演示数据功能待迁移' });
  }
}
