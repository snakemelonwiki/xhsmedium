import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

interface FailedImportRow {
  rowIndex?: number;
  row?: number;
  message?: string;
  reason?: string;
  raw?: string;
}

/**
 * 将批量导入失败行写入 uploads/import-errors，并返回前端可下载 URL。
 */
export function writeImportErrorFile(rootDir: string, taskId: string, rows: FailedImportRow[]): string | null {
  if (!rows.length) return null;
  const relativeDir = 'uploads/import-errors';
  const absoluteDir = join(rootDir, relativeDir);
  if (!existsSync(absoluteDir)) {
    mkdirSync(absoluteDir, { recursive: true });
  }
  const filename = `${taskId}-errors.csv`;
  const lines = [
    'row,message,raw',
    ...rows.map((row) => [
      row.rowIndex ?? row.row ?? '',
      row.message ?? row.reason ?? '',
      row.raw ?? '',
    ].map(csvCell).join(',')),
  ];
  writeFileSync(join(absoluteDir, filename), `\uFEFF${lines.join('\n')}`, 'utf8');
  return `/uploads/import-errors/${filename}`;
}

/**
 * 获取项目根目录，兼容从根目录或 backend 子目录启动 NestJS。
 */
export function getProjectRoot(): string {
  return process.cwd().endsWith('backend') ? join(process.cwd(), '..') : process.cwd();
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
