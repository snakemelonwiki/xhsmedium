import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 存储抽象：当前实现写入仓库根 uploads/exports/，main.ts 已经把 uploads/ 暴露为
 * 静态资源 (/uploads)，所以返回的 URL 直接对应文件路径。
 * 后续切 OSS 时只需要换实现，不动业务代码（service 只面向 saveCsv 一个方法）。
 */
@Injectable()
export class StorageService {
  private readonly uploadsRoot: string;

  constructor() {
    // 与 ImportsService.writeErrorCsv 保持同一策略：
    // 编译后该文件位于 dist/modules/exports/storage.service.js，
    // 上溯四级到仓库根 (dist/modules/exports/ -> dist/modules -> dist -> backend -> repo)。
    this.uploadsRoot = path.join(__dirname, '..', '..', '..', '..', 'uploads', 'exports');
    try {
      if (!fs.existsSync(this.uploadsRoot)) {
        fs.mkdirSync(this.uploadsRoot, { recursive: true });
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('[storage] init uploads/exports failed:', err?.message || err);
    }
  }

  /**
   * 保存 CSV 内容，返回前端可访问的相对 URL（/uploads/exports/<id>.csv）。
   * - 前置 UTF-8 BOM 让 Excel/WPS 不会乱码
   * - 行分隔统一 CRLF（与 imports 错误 CSV 对齐）
   */
  async saveCsv(exportId: string, csvContent: string): Promise<string> {
    const filename = `${exportId}.csv`;
    const filepath = path.join(this.uploadsRoot, filename);
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const body = Buffer.from(csvContent, 'utf8');
    await fs.promises.writeFile(filepath, Buffer.concat([bom, body]));
    return `/uploads/exports/${filename}`;
  }
}
