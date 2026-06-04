import { Body, Controller, Get, HttpCode, Logger, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { isParserFailure, ParserService } from './parser.service';

const HTTP_CODE_FOR_CODE: Record<string, number> = {
  platform_unsupported: 400,
  usage: 400,
  login_required: 401,
  playwright_missing: 500,
  uncaught: 500,
  transient: 502,
  unknown: 500,
  exhausted: 502,
};

/**
 * 通用帖子解析端点
 *   POST /api/parser/parse
 *   body: { url: string, retry?: number, timeout?: number }
 *   resp: { ok: true, data: {...} } | { ok: false, error: { code, retryable, message, platform } }
 */
@Controller('parser')
export class ParserController {
  private readonly logger = new Logger(ParserController.name);

  constructor(private readonly parserService: ParserService) {}

  @Post('parse')
  @HttpCode(200)
  async parse(@Body() body: any, @Res() res: Response) {
    const url = String(body?.url || '').trim();
    if (!url) {
      return res.status(400).json({
        ok: false,
        error: { code: 'usage', retryable: false, message: 'url 必填', platform: '' },
      });
    }
    const opts = {
      retry: body?.retry !== undefined ? Number(body.retry) : undefined,
      timeout: body?.timeout !== undefined ? Number(body.timeout) : undefined,
    };

    const result = await this.parserService.parse(url, opts);
    if (isParserFailure(result)) {
      const status = HTTP_CODE_FOR_CODE[result.error.code] ?? 500;
      this.logger.warn(
        `parse failed code=${result.error.code} platform=${result.error.platform} url=${url}`,
      );
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  }

  /**
   * 启动 headful 登录浏览器（带 UI，扫码登录）
   * 适用环境：本地有 GUI 的桌面系统
   *   POST /api/parser/open-login { platform: '小红书'|'抖音' }
   *   resp: { ok: true, platform }
   */
  @Post('open-login')
  async openLogin(@Body() body: any, @Res() res: Response) {
    const platform = String(body?.platform || '').trim();
    if (!platform) {
      return res.status(400).json({ ok: false, error: { code: 'usage', message: 'platform 必填' } });
    }
    try {
      const result = await this.parserService.openLogin(platform);
      this.logger.log(`openLogin ${platform} ok`);
      return res.json(result);
    } catch (err: any) {
      this.logger.warn(`openLogin ${platform} failed: ${err?.message}`);
      return res.status(500).json({
        ok: false,
        error: {
          code: 'open_failed',
          message: err?.message || String(err),
          hint: '登录浏览器需要 GUI 环境（Windows / macOS 桌面）；服务器请先在本地登录后 rsync .playwright-profiles/',
        },
      });
    }
  }

  /**
   * 关闭已打开的登录浏览器
   *   POST /api/parser/close-login { platform: '小红书'|'抖音' }
   */
  @Post('close-login')
  async closeLogin(@Body() body: any, @Res() res: Response) {
    const platform = String(body?.platform || '').trim();
    if (!platform) {
      return res.status(400).json({ ok: false, error: { code: 'usage', message: 'platform 必填' } });
    }
    const result = await this.parserService.closeLogin(platform);
    return res.json(result);
  }

  /**
   * 查询 2 平台的 profile 登录态
   *   GET /api/parser/login-status
   *   GET /api/parser/login-status?platform=小红书
   */
  @Get('login-status')
  async getLoginStatus(@Query('platform') platform: string | undefined, @Res() res: Response) {
    if (platform) {
      try {
        return res.json({ ok: true, item: this.parserService.getLoginStatus(platform) });
      } catch (err: any) {
        return res.status(400).json({ ok: false, error: { code: 'usage', message: err?.message } });
      }
    }
    return res.json({ ok: true, items: this.parserService.getAllLoginStatus() });
  }
}
