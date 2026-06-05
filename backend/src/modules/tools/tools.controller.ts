import { Body, Controller, Get, HttpCode, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { isParserFailure, ParserService } from '../parser/parser.service';

/**
 * 抓取工具端点。
 *
 * 全部抓取走 `ParserService`（透传到 scripts/parser-core.js 的 fetchWithRetry），
 * 不再直接 require 根目录的 metricsFetcher.js：
 *   - 拿到自动重试（默认 3 次，指数退避 1s/2s/4s/8s）
 *   - 拿到统一错误分类（playwright_missing / login_required / transient / unknown / exhausted）
 *   - 拿到明确 HTTP 状态码（401/500/502）
 *
 * 端点列表：
 *   POST /api/tools/fetch-metrics                  链接测试：纯抓取，不入库
 *   POST /api/tools/fetch-metrics-with-retry       同上，但支持自定义 retry / timeout
 *   GET  | POST /api/tools/open-login-browser       启动有头浏览器供用户扫码登录
 *   GET  | POST /api/tools/close-login-browser      关闭已打开的登录浏览器
 *   GET       /api/tools/login-status               查询平台 Profile 登录态
 *   POST      /api/tools/seed-demo                  演示数据（占位）
 */
@Controller('tools')
export class ToolsController {
  private readonly logger = new Logger(ToolsController.name);

  constructor(private readonly parserService: ParserService) {}

  // ────────────────────────────────────────────────────────────────────
  // 抓取：纯测试 / 工具页使用，不写库
  // ────────────────────────────────────────────────────────────────────

  /**
   * 抓取帖子指标。
   *   POST /api/tools/fetch-metrics
   *   body: { url: string }
   *   200:  { ok: true, data: { platform, title, likes, comments, favorites, shares, ... } }
   *   4xx:  { ok: false, error: { code, message, platform, retryable } }
   */
  @Post('fetch-metrics')
  @HttpCode(200)
  async fetchMetrics(@Body() body: any, @Res() res: Response) {
    const url = String(body?.url || '').trim();
    if (!url) {
      return res.status(400).json({
        ok: false,
        error: { code: 'usage', retryable: false, message: '请先输入作品链接', platform: '' },
      });
    }
    const result = await this.parserService.parse(url);
    if (isParserFailure(result)) {
      const status = this.statusForCode(result.error.code);
      this.logger.warn(
        `fetch-metrics failed code=${result.error.code} platform=${result.error.platform} url=${url}`,
      );
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  }

  /**
   * 同上，但调用方可自定义重试次数和单次超时。
   *   POST /api/tools/fetch-metrics-with-retry
   *   body: { url, retry?, timeout? }
   */
  @Post('fetch-metrics-with-retry')
  @HttpCode(200)
  async fetchMetricsWithRetry(@Body() body: any, @Res() res: Response) {
    const url = String(body?.url || '').trim();
    if (!url) {
      return res.status(400).json({
        ok: false,
        error: { code: 'usage', retryable: false, message: '请先输入作品链接', platform: '' },
      });
    }
    const opts = {
      retry: body?.retry !== undefined ? Number(body.retry) : undefined,
      timeout: body?.timeout !== undefined ? Number(body.timeout) : undefined,
    };
    const result = await this.parserService.parse(url, opts);
    if (isParserFailure(result)) {
      const status = this.statusForCode(result.error.code);
      this.logger.warn(
        `fetch-metrics-with-retry failed code=${result.error.code} platform=${result.error.platform} url=${url}`,
      );
      return res.status(status).json(result);
    }
    return res.status(200).json(result);
  }

  // ────────────────────────────────────────────────────────────────────
  // 登录浏览器：有头窗口，扫码后登录态落到磁盘 Profile
  // ────────────────────────────────────────────────────────────────────

  /**
   * 启动 headful 登录浏览器（带 UI）。需要 GUI 桌面环境；服务器环境会失败。
   * 同时支持 GET / POST 是为了前端"按钮"直连方便。
   *   GET  /api/tools/open-login-browser?platform=小红书
   *   POST /api/tools/open-login-browser { platform: '小红书' | '抖音' }
   */
  @Get('open-login-browser')
  @Post('open-login-browser')
  async openLoginBrowser(@Req() req: Request, @Body() body: any, @Res() res: Response) {
    const platform = String(body?.platform || req.query?.platform || '').trim();
    if (!platform) {
      return res.status(400).json({
        ok: false,
        error: { code: 'usage', message: 'platform 必填（小红书 / 抖音）' },
      });
    }
    try {
      const result = await this.parserService.openLogin(platform);
      this.logger.log(`openLoginBrowser ${platform} ok`);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      this.logger.warn(`openLoginBrowser ${platform} failed: ${err?.message}`);
      return res.status(500).json({
        ok: false,
        error: {
          code: 'open_failed',
          message: err?.message || String(err),
          hint: '登录浏览器需要 GUI 环境（Windows / macOS 桌面）。Linux 服务器请先在本地登录后 rsync .playwright-profiles/ 上来。',
        },
      });
    }
  }

  /**
   * 关闭已打开的登录浏览器。
   *   GET  /api/tools/close-login-browser?platform=小红书
   *   POST /api/tools/close-login-browser { platform }
   */
  @Get('close-login-browser')
  @Post('close-login-browser')
  async closeLoginBrowser(@Req() req: Request, @Body() body: any, @Res() res: Response) {
    const platform = String(body?.platform || req.query?.platform || '').trim();
    if (!platform) {
      return res.status(400).json({ ok: false, error: { code: 'usage', message: 'platform 必填' } });
    }
    try {
      const result = await this.parserService.closeLogin(platform);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: 'close_failed', message: err?.message } });
    }
  }

  /**
   * 查询 2 平台 Profile 登录态（基于 Cookies 文件存在性）。
   *   GET /api/tools/login-status
   *   GET /api/tools/login-status?platform=小红书
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

  // ────────────────────────────────────────────────────────────────────
  // 占位
  // ────────────────────────────────────────────────────────────────────

  @Post('seed-demo')
  async seedDemo(@Req() req: Request, @Res() res: Response) {
    return res.json({ ok: true, message: '演示数据功能待迁移，参见 scripts/seed-account-analysis.js' });
  }

  // ────────────────────────────────────────────────────────────────────

  /**
   * 把 parser-core 的错误码映射到 HTTP 状态码。
   * 401 = 登录墙、500 = 内部缺 Playwright / 未知错误、502 = 网络瞬时失败 / 重试耗尽
   */
  private statusForCode(code: string): number {
    switch (code) {
      case 'platform_unsupported':
      case 'usage':
        return 400;
      case 'login_required':
        return 401;
      case 'transient':
      case 'exhausted':
        return 502;
      case 'playwright_missing':
      case 'unknown':
      default:
        return 500;
    }
  }
}
