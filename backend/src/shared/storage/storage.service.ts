import { Injectable, Module, Global } from '@nestjs/common';
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
}

@Injectable()
export class StorageService {
  private readonly uploadsRoot: string;
  private readonly driver: string;

  constructor() {
    this.driver = process.env.OBJECT_STORAGE_DRIVER || 'local';
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
    if (this.driver !== 'local') {
      // eslint-disable-next-line no-console
      console.warn(`[storage] driver=${this.driver} 未实现，回退到 local`);
    }
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
    const dir = path.join(this.uploadsRoot, safeBucket);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filepath = path.join(dir, safeKey);
    let body = buf;
    if (opts.bom) {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      body = Buffer.concat([bom, buf]);
    }
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
