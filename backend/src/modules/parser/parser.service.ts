import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const parserCore = require('../../../../scripts/parser-core');

export interface ParserOptions {
  retry?: number;
  timeout?: number;
}

export interface ParserSuccess {
  ok: true;
  data: {
    platform: string;
    title: string;
    likes: number;
    comments: number;
    favorites: number;
    shares: number;
    metricsUpdatedAt: string;
  };
}

export interface ParserFailure {
  ok: false;
  error: {
    code: string;
    retryable: boolean;
    message: string;
    platform: string;
  };
}

export type ParserResult = ParserSuccess | ParserFailure;

/**
 * Type guard: 排除 ParserSuccess 留下 ParserFailure
 */
export function isParserFailure(r: ParserResult): r is ParserFailure {
  return r.ok === false;
}

/**
 * 通用帖子解析服务：复用 scripts/parser-core.js 的 fetchWithRetry，
 * 给 NestJS 路由暴露为同步 Promise。
 *
 * 注意：通过 parserCore.fetchWithRetry 间接调用（而非 destructure），
 * 这样 jest.spyOn(parserCore, 'fetchWithRetry') 才能在测试中拦截。
 */
@Injectable()
export class ParserService {
  private readonly logger = new Logger(ParserService.name);

  async parse(url: string, opts: ParserOptions = {}): Promise<ParserResult> {
    const retry = Math.max(0, Number(opts.retry ?? 3));
    const timeout = Math.max(1000, Number(opts.timeout ?? 20000));
    const log = (msg: string) => this.logger.debug?.(msg) ?? this.logger.log(msg);

    return parserCore.fetchWithRetry(url, { retry, timeout, log });
  }

  /**
   * 错误分类（暴露给 controller 用于 HTTP 状态码映射）
   */
  classifyError(err: any) {
    return parserCore.classifyError(err);
  }

  // ---- 登录态管理 ----

  /**
   * 启动 headful 登录浏览器（带 UI，让用户扫码）
   * 注意：需要 GUI 环境（桌面系统）。服务器跑会失败。
   */
  async openLogin(platform: string) {
    this.assertPlatform(platform);
    return parserCore.openLoginBrowser(platform);
  }

  /**
   * 关闭已打开的登录浏览器
   */
  async closeLogin(platform: string) {
    this.assertPlatform(platform);
    return parserCore.closeLoginBrowser(platform);
  }

  /**
   * 查询某平台 profile 登录态（基于 Cookies 文件存在性）
   */
  getLoginStatus(platform: string) {
    this.assertPlatform(platform);
    return parserCore.getLoginStatus(platform);
  }

  /**
   * 同时查询 2 平台的登录态
   */
  getAllLoginStatus() {
    return ['小红书', '抖音'].map((p) => parserCore.getLoginStatus(p));
  }

  private assertPlatform(platform: string) {
    if (!['小红书', '抖音'].includes(platform)) {
      throw new Error(`不支持的平台: ${platform}，仅支持 小红书 / 抖音`);
    }
  }
}
