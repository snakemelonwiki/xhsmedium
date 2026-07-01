import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
 * multer 2.x 已原生按 UTF-8 解析 filename（旧版 1.x 用 latin1 才需要 latin1→utf8 修正）。
 * 直接返回原始值即可，再做 latin1 转换反而会导致中文双重解码乱码。
 */
function decodeUploadFilename(raw: string): string {
  return raw;
}

/**
 * 通用帖子解析端点
 *   POST /api/parser/parse
 *   body: { url: string, retry?: number, timeout?: number, account?: string }
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
      account: body?.account, // 新增：指定抓取账号
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
   *   POST /api/parser/open-login { platform: '小红书'|'抖音', account?: string }
   */
  @Post('open-login')
  async openLogin(@Body() body: any, @Res() res: Response) {
    const platform = String(body?.platform || '').trim();
    if (!platform) {
      return res.status(400).json({ ok: false, error: { code: 'usage', message: 'platform 必填' } });
    }
    try {
      const result = await this.parserService.openLogin(platform, body?.account);
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
   *   POST /api/parser/close-login { platform: '小红书'|'抖音', account?: string }
   */
  @Post('close-login')
  async closeLogin(@Body() body: any, @Res() res: Response) {
    const platform = String(body?.platform || '').trim();
    if (!platform) {
      return res.status(400).json({ ok: false, error: { code: 'usage', message: 'platform 必填' } });
    }
    const account = body?.account ? String(body.account) : undefined;
    const result = account
      ? await this.parserService.closeLogin(platform, account)
      : await this.parserService.closeLogin(platform);
    return res.json(result);
  }

  /**
   * T10.2 截图 OCR 占位端点
   */
  @Post('parse-image')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  async parseImage(
    @UploadedFile() file: any,
    @Res() res: Response,
  ) {
    if (!file?.buffer) {
      return res.status(400).json({
        ok: false,
        error: { code: 'usage', message: '请上传截图 (field=image)' },
      });
    }
    try {
      const result = await this.parserService.parseImage({
        buffer: file.buffer,
        originalname: decodeUploadFilename(file.originalname),
        mimetype: file.mimetype,
        size: file.size,
      });
      return res.json(result);
    } catch (err: any) {
      this.logger.warn(`parseImage failed: ${err?.message}`);
      return res.status(500).json({
        ok: false,
        error: { code: 'ocr_failed', message: err?.message || String(err) },
      });
    }
  }

  /**
   * 查询某个平台或所有抓取账号的登录态
   *   GET /api/parser/account-status?platform=小红书
   *   GET /api/parser/account-status
   */
  @Get('account-status')
  async getAccountStatus(@Query('platform') platform: string | undefined, @Res() res: Response) {
    const items = this.parserService.getScrapingAccountStatus(platform);
    return res.json({ ok: true, items });
  }

  /**
   * 列出抓取账号
   *   GET /api/parser/accounts?platform=小红书
   */
  @Get('accounts')
  async listAccounts(@Query('platform') platform: string | undefined, @Res() res: Response) {
    const accounts = this.parserService.listScrapingAccounts(platform);
    return res.json({ ok: true, accounts });
  }

  /**
   * 查询某平台 profile 登录态（旧版兼容）
   *   GET /api/parser/login-status
   *   GET /api/parser/login-status?platform=小红书
   *   GET /api/parser/login-status?platform=小红书&account=acc_174002
   */
  @Get('login-status')
  async getLoginStatus(
    @Query('platform') platform: string | undefined,
    @Res() res: Response,
    @Query('account') account?: string,
  ) {
    try {
      if (platform) {
        try {
          const item = account
            ? this.parserService.getLoginStatus(platform, account)
            : this.parserService.getLoginStatus(platform);
          return res.json({ ok: true, item });
        } catch (err: any) {
          return res.status(400).json({ ok: false, error: { code: 'usage', message: err?.message } });
        }
      }
      return res.json({ ok: true, items: this.parserService.getAllLoginStatus() });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: { code: 'internal', message: err?.message } });
    }
  }
}
