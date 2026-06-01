import { Global, Inject, Injectable, Module, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 对象存储抽象层（T-22）
 *
 * 当前实现 = 本地磁盘（写入仓库根 uploads/<bucket>/<key>），URL 路径
 * 通过 main.ts 的 expressStatic 暴露成 /uploads/<bucket>/<key>。
 *
 * 切真 OSS（阿里云 / MinIO / S3）时只需要：
 *   1. 改 OBJECT_STORAGE_DRIVER=oss + 添加 access key 等环境变量
 *   2. 在 putBuffer / putCsv 内部判断 driver 走 OSS SDK
 *   3. 业务代码完全不变（imports / exports / lead-capture 都通过这层）
 *
 * 业界 OSS 的 API 都是 putObject / getObjectUrl 形态，本接口与之同构。
 */

export interface PutOptions {
  /** 是否写入 UTF-8 BOM（CSV 给 Excel 用） */
  bom?: boolean;
  /** 自定义 Content-Type（OSS 模式下生效，本地暂不用） */
  contentType?: string;
  /**
   * 单次上传覆盖当前 driver；'local' 强制写本地，'oss' 强制写 OSS。
   * 缺省时走 this.driver（来自 OBJECT_STORAGE_DRIVER 环境变量）。
   * 当前端在 Modal 里选了与默认不同的目标时使用。
   */
  driverOverride?: 'local' | 'oss';
}

type StorageEnv = Record<string, string | undefined>;

interface OssClientLike {
  put(name: string, file: Buffer, options?: any): Promise<any>;
  delete?(name: string): Promise<any>;
  signatureUrl?(name: string, options?: { expires?: number; method?: string }): string;
}

@Injectable()
export class StorageService {
  private readonly uploadsRoot: string;
  private readonly driver: string;
  private readonly env: StorageEnv;
  private readonly ossClient?: OssClientLike;

  constructor(
    @Optional() @Inject('STORAGE_ENV') env: StorageEnv = process.env,
    @Optional() @Inject('OSS_CLIENT') ossClient?: OssClientLike,
  ) {
    this.env = env || process.env;
    this.driver = this.env.OBJECT_STORAGE_DRIVER || 'local';
    // 编译后位于 dist/shared/storage/storage.service.js，上溯四级到仓库根
    this.uploadsRoot = path.join(__dirname, '..', '..', '..', '..', 'uploads');
    try {
      if (!fs.existsSync(this.uploadsRoot)) {
        fs.mkdirSync(this.uploadsRoot, { recursive: true });
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('[storage] init uploads root failed:', err?.message || err);
    }
    this.ossClient = ossClient || this.createOssClient();
  }

  /**
   * 写入 Buffer 到指定 bucket/key，返回前端可访问的相对 URL
   *  bucket: 业务子目录（exports / imports / lead-captures / post-covers）
   *  key:    文件名（含扩展名）
   *  buf:    内容
   *
   * 本地模式 → uploads/<bucket>/<key>
   * OSS 模式 → 调用 putObject，返回签名 URL（待实现）
   */
  async putBuffer(bucket: string, key: string, buf: Buffer, opts: PutOptions = {}): Promise<string> {
    const safeBucket = this.safeName(bucket);
    const safeKey = this.safeKey(key);
    let body = buf;
    if (opts.bom) {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      body = Buffer.concat([bom, buf]);
    }
    const effectiveDriver = opts.driverOverride === 'oss' || opts.driverOverride === 'local'
      ? opts.driverOverride
      : this.driver;
    if (effectiveDriver === 'oss') {
      const client = this.ossClient || this.createOssClient();
      const objectName = this.toObjectName(safeBucket, safeKey);
      await client!.put(objectName, body, this.toOssPutOptions(opts));
      return this.toAppViewUrl(safeBucket, safeKey);
    }

    const dir = path.join(this.uploadsRoot, safeBucket);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, safeKey);
    await fs.promises.writeFile(filepath, body);
    return `/uploads/${safeBucket}/${safeKey}`;
  }

  /**
   * 写入 CSV（自动加 BOM 让 Excel 不乱码 + CRLF 行分隔由调用方决定）
   */
  async putCsv(bucket: string, key: string, csvContent: string): Promise<string> {
    return this.putBuffer(bucket, key, Buffer.from(csvContent, 'utf8'), { bom: true, contentType: 'text/csv; charset=utf-8' });
  }

  /**
   * 删除（OSS 切换时只需替换实现）
   */
  async remove(bucket: string, key: string): Promise<void> {
    const safeBucket = this.safeName(bucket);
    const safeKey = this.safeKey(key);
    if (this.isOssDriver()) {
      await this.ossClient?.delete?.(this.toObjectName(safeBucket, safeKey));
      return;
    }

    const filepath = path.join(this.uploadsRoot, safeBucket, safeKey);
    try {
      await fs.promises.unlink(filepath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        // eslint-disable-next-line no-console
        console.warn('[storage] remove failed:', err?.message || err);
      }
    }
  }

  /**
   * 解析 URL 得到本地物理路径（用于直接 stream 返回，配合 NestJS @Res() 用）
   */
  resolveLocalPath(url: string): string | null {
    if (!url || !url.startsWith('/uploads/')) return null;
    const rel = url.slice('/uploads/'.length);
    return path.join(this.uploadsRoot, rel);
  }

  /** 当前 driver（用于诊断） */
  getDriver(): string {
    return this.driver;
  }

  /**
   * 给定一个 driverOverride 选项，返回实际生效的 driver。
   * 用作单次上传完成后向调用方回报"落到哪里了"。
   */
  resolveEffectiveDriver(opts?: { driverOverride?: 'local' | 'oss' }): 'local' | 'oss' {
    if (opts?.driverOverride === 'oss' || opts?.driverOverride === 'local') {
      return opts.driverOverride;
    }
    return this.driver === 'oss' ? 'oss' : 'local';
  }

  /**
   * 将业务稳定路径转换为浏览器可访问地址。
   * OSS 私有模式返回短期签名 URL；本地模式返回 /uploads 路径。
   */
  getReadableUrl(bucket: string, key: string): string {
    const safeBucket = this.safeName(bucket);
    const safeKey = this.safeKey(key);
    if (!this.isOssDriver()) {
      return `/uploads/${safeBucket}/${safeKey}`;
    }

    const objectName = this.toObjectName(safeBucket, safeKey);
    if (this.isPrivateOss()) {
      return this.ossClient!.signatureUrl!(objectName, {
        expires: this.signUrlExpires(),
        method: 'GET',
      });
    }

    return `${this.publicBaseUrl().replace(/\/+$/, '')}/${objectName}`;
  }

  /**
   * OSS 模式下返回 /api/uploads/view/<bucket>/<key>，供数据库保存稳定路径。
   */
  private toAppViewUrl(bucket: string, key: string): string {
    return `/api/uploads/view/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
  }

  private isOssDriver(): boolean {
    return this.driver === 'oss';
  }

  private isPrivateOss(): boolean {
    return String(this.env.OSS_PRIVATE ?? 'true').toLowerCase() !== 'false';
  }

  private signUrlExpires(): number {
    const seconds = Number(this.env.OSS_SIGN_URL_EXPIRES || 900);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 900;
  }

  private publicBaseUrl(): string {
    const configured = String(this.env.OSS_PUBLIC_BASE_URL || '').trim();
    if (configured) return configured;
    const bucket = this.requiredEnv('OSS_BUCKET');
    const endpoint = this.requiredEnv('OSS_ENDPOINT').replace(/^https?:\/\//, '');
    return `https://${bucket}.${endpoint}`;
  }

  private toObjectName(bucket: string, key: string): string {
    const prefix = String(this.env.OSS_PREFIX || '').trim().replace(/^\/+|\/+$/g, '');
    return [prefix, bucket, key].filter(Boolean).join('/');
  }

  private toOssPutOptions(opts: PutOptions): any {
    if (!opts.contentType) return undefined;
    return { headers: { 'Content-Type': opts.contentType } };
  }

  private createOssClient(): OssClientLike | undefined {
    if (!this.isOssDriver()) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OSS = require('ali-oss');
    return new OSS({
      region: this.requiredEnv('OSS_REGION'),
      bucket: this.requiredEnv('OSS_BUCKET'),
      endpoint: this.requiredEnv('OSS_ENDPOINT'),
      accessKeyId: this.requiredEnv('OSS_ACCESS_KEY_ID'),
      accessKeySecret: this.requiredEnv('OSS_ACCESS_KEY_SECRET'),
    });
  }

  private requiredEnv(name: string): string {
    const value = String(this.env[name] || '').trim();
    if (!value) throw new Error(`missing required storage env: ${name}`);
    return value;
  }

  // ---- 安全工具：拒绝 .. 跨目录、空名、绝对路径 ----
  private safeName(name: string): string {
    const trimmed = String(name || '').trim();
    if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
      throw new Error(`unsafe bucket name: ${name}`);
    }
    return trimmed;
  }

  private safeKey(key: string): string {
    const trimmed = String(key || '').trim();
    if (!trimmed || trimmed.includes('..') || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
      throw new Error(`unsafe key: ${key}`);
    }
    return trimmed;
  }
}

/**
 * 全局 Module — 各业务模块直接 inject StorageService 即可，不必各自 imports
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
