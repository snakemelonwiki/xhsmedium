import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { resolveRepoRoot } from '../../../shared/utils/project-paths';

export type ScrapingPlatformCode = 'douyin' | 'xiaohongshu';

export interface ScrapingAccount {
  /** 账号唯一标识（如 default、acc_174002） */
  id: string;
  /** 平台代码 */
  platform: ScrapingPlatformCode;
  /** 展示名称 */
  label: string;
  /** profile 目录绝对路径 */
  profileDir: string;
  /** 是否启用 */
  enabled: boolean;
  /** 是否为该平台默认账号 */
  isDefault?: boolean;
}

interface AccountJsonEntry {
  id: string;
  platform: ScrapingPlatformCode;
  label: string;
  profileDir: string;
  enabled?: boolean;
  isDefault?: boolean;
}

interface AccountsJson {
  version?: number;
  accounts: AccountJsonEntry[];
}

const PLATFORM_CODE_MAP: Record<string, ScrapingPlatformCode> = {
  'douyin': 'douyin',
  'xiaohongshu': 'xiaohongshu',
  '抖音': 'douyin',
  '小红书': 'xiaohongshu',
};

const DISPLAY_PLATFORM_MAP: Record<ScrapingPlatformCode, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
};

/**
 * 抓取账号配置服务
 *
 * 设计原则：
 *   1. 不依赖数据库，直接读取 `.playwright-profiles/accounts.json`。
 *   2. 配置文件不存在或解析失败时，fallback 到旧逻辑：每个平台只有一个默认账号，
 *      profileDir 指向 `.playwright-profiles/douyin` 或 `.playwright-profiles/xiaohongshu`。
 *   3. 这样改动最小，完全兼容现有业务。
 */
@Injectable()
export class ProfileConfigService {
  private readonly logger = new Logger(ProfileConfigService.name);
  private readonly profileRoot: string;
  private readonly accountsFile: string;

  constructor() {
    this.profileRoot = this.resolveProfileRoot();
    this.accountsFile = path.join(this.profileRoot, 'accounts.json');
  }

  /**
   * 列出某个平台或所有可用账号。
   * @param platform 'douyin' | 'xiaohongshu' | '抖音' | '小红书'，不传返回全部
   * @param onlyEnabled 是否只返回 enabled 的账号（默认 true）
   */
  listAccounts(platform?: string, onlyEnabled = true): ScrapingAccount[] {
    const all = this.readAccounts();
    const code = platform ? this.normalizePlatform(platform) : undefined;
    return all.filter((a) => {
      if (code && a.platform !== code) return false;
      if (onlyEnabled && !a.enabled) return false;
      return true;
    });
  }

  /**
   * 获取指定账号；若 accountId 为空，返回该平台默认账号。
   */
  getAccount(platform: string, accountId?: string): ScrapingAccount | null {
    const code = this.normalizePlatform(platform);
    const all = this.readAccounts();

    if (accountId) {
      const found = all.find((a) => a.platform === code && a.id === accountId && a.enabled);
      if (found) return found;
      this.logger.warn(`[ProfileConfig] 账号 ${accountId} (${code}) 未找到或已禁用，尝试使用默认账号`);
    }

    return this.getDefaultAccountByCode(code, all);
  }

  /**
   * 获取默认账号。
   */
  getDefaultAccount(platform: string): ScrapingAccount | null {
    return this.getDefaultAccountByCode(this.normalizePlatform(platform), this.readAccounts());
  }

  /**
   * 返回可用于轮询的候选账号。
   */
  getCandidates(platform: string): ScrapingAccount[] {
    return this.listAccounts(platform, true);
  }

  /**
   * 返回当前配置文件路径（调试用）。
   */
  getConfigPath(): string {
    return this.accountsFile;
  }

  /**
   * 把平台名称统一转成本服务内部使用的 code。
   */
  normalizePlatform(platform: string): ScrapingPlatformCode {
    const key = String(platform || '').trim().toLowerCase();
    const code = PLATFORM_CODE_MAP[key];
    if (!code) {
      throw new Error(`不支持的平台: ${platform}，仅支持 抖音/douyin 或 小红书/xiaohongshu`);
    }
    return code;
  }

  /**
   * 把 code 转成中文展示名称。
   */
  displayPlatform(platform: string): string {
    const code = this.normalizePlatform(platform);
    return DISPLAY_PLATFORM_MAP[code];
  }

  private readAccounts(): ScrapingAccount[] {
    if (!fs.existsSync(this.accountsFile)) {
      return this.fallbackAccounts();
    }
    try {
      const raw = fs.readFileSync(this.accountsFile, 'utf-8');
      const json: AccountsJson = JSON.parse(raw);
      if (!Array.isArray(json.accounts) || json.accounts.length === 0) {
        return this.fallbackAccounts();
      }
      const accounts = json.accounts
        .filter((a) => !!a.id && !!a.platform)
        .map((a) => this.resolveAccount(a));
      return accounts.length > 0 ? accounts : this.fallbackAccounts();
    } catch (err: any) {
      this.logger.warn(`[ProfileConfig] 读取 accounts.json 失败: ${err?.message}，使用 fallback 配置`);
      return this.fallbackAccounts();
    }
  }

  private resolveAccount(entry: AccountJsonEntry): ScrapingAccount {
    const code = PLATFORM_CODE_MAP[entry.platform] || entry.platform;
    const profileDir = path.isAbsolute(entry.profileDir)
      ? entry.profileDir
      : path.join(this.profileRoot, entry.profileDir);
    return {
      id: entry.id,
      platform: code as ScrapingPlatformCode,
      label: entry.label || entry.id,
      profileDir,
      enabled: entry.enabled !== false,
      isDefault: entry.isDefault === true,
    };
  }

  private getDefaultAccountByCode(code: ScrapingPlatformCode, all: ScrapingAccount[]): ScrapingAccount | null {
    const enabled = all.filter((a) => a.platform === code && a.enabled);
    const explicitDefault = enabled.find((a) => a.isDefault);
    if (explicitDefault) return explicitDefault;
    if (enabled.length > 0) return enabled[0];
    const fallback = this.fallbackAccounts().find((a) => a.platform === code);
    return fallback ?? null;
  }

  private fallbackAccounts(): ScrapingAccount[] {
    return [
      {
        id: 'default',
        platform: 'douyin',
        label: '默认主账号',
        profileDir: path.join(this.profileRoot, 'douyin'),
        enabled: true,
        isDefault: true,
      },
      {
        id: 'default',
        platform: 'xiaohongshu',
        label: '默认主账号',
        profileDir: path.join(this.profileRoot, 'xiaohongshu'),
        enabled: true,
        isDefault: true,
      },
    ];
  }

  private resolveProfileRoot(): string {
    const root = resolveRepoRoot(__dirname);
    const profileRoot = path.join(root, '.playwright-profiles');
    fs.mkdirSync(profileRoot, { recursive: true });
    return profileRoot;
  }
}
