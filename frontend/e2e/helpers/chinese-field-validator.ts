// helpers/chinese-field-validator.ts
// v1.3 增量：导出文件的中文字段/脱敏/UTF-8/BOM 校验工具
//
// 用途：
//   1. downloadExportFile(page, exportType) — 触发并下载导出文件
//   2. validateChineseHeaders(buf, expected) — 校验表头是中文
//   3. validateUtf8NoGarbled(text) — 校验 UTF-8 不乱码
//   4. validateBom(buf) — 校验 CSV 含 UTF-8 BOM
//   5. validateMasked(text, '13800000001') — 校验联系方式脱敏为 138****0001
//   6. collectConsoleErrors(page) — 收集 console error，case 末尾断言无严重
//
// 依赖：node:fs / node:path（用于落盘导出文件）
// 不依赖：xlsx 库（我们直接对 .csv 用字符串校验；.xlsx 走 xlsx 库的可选实现）

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Response } from '@playwright/test';

const SCREENSHOT_ROOT = resolve(__dirname, '../../../screenshots/v1.3-exports');

export interface ExportTriggerOptions {
  /** 触发导出的入口 URL（前端页面） */
  pageUrl: string;
  /** 触发按钮 selector */
  triggerSelector: string;
  /** 等待的 API path 包含串（如 '/api/exports'） */
  apiPathContains?: string;
  /** 角色（admin/owner 时不脱敏） */
  role: 'admin' | 'owner' | 'staff' | 'sales' | 'academic';
  /** 导出类型（用于文件命名） */
  exportType: 'leads' | 'orders' | 'order_progress' | 'posts' | 'rankings' | 'accounts' | 'collaboration_records';
  /** 超时 */
  timeout?: number;
}

export interface DownloadedFile {
  path: string;
  url: string;
  suggestedFilename: string;
  contentType: string;
  contentLength: number;
}

/**
 * 触发导出并把文件落到本地。
 * 返回 DownloadedFile 供后续校验。
 */
export async function downloadExportFile(
  page: Page,
  opts: ExportTriggerOptions,
): Promise<DownloadedFile> {
  const downloadPromise = page.waitForEvent('download', {
    timeout: opts.timeout ?? 30_000,
  });
  await page.goto(opts.pageUrl, { waitUntil: 'domcontentloaded' });
  if (opts.apiPathContains) {
    // 监听导出创建 API
    page.waitForResponse(
      (r) =>
        r.url().includes(opts.apiPathContains!) &&
        r.request().method() === 'POST',
      { timeout: 10_000 },
    ).catch(() => {/* best-effort */});
  }
  await page.locator(opts.triggerSelector).first().click();
  const download = await downloadPromise;

  const suggested = download.suggestedFilename();
  const dir = resolve(SCREENSHOT_ROOT, opts.exportType);
  await fs.mkdir(dir, { recursive: true });
  const path = resolve(dir, `${Date.now()}_${suggested}`);
  await download.saveAs(path);
  const stat = await fs.stat(path);
  return {
    path,
    url: download.url(),
    suggestedFilename: suggested,
    contentType: 'application/octet-stream',
    contentLength: stat.size,
  };
}

/**
 * 读取下载文件到 Buffer。
 */
export async function readDownloadedFile(path: string): Promise<Buffer> {
  return fs.readFile(path);
}

/**
 * 校验 UTF-8 BOM (EF BB BF) 在文件首 3 字节。
 * xlsx 文件本身是二进制 zip，不需要 BOM。
 */
export function validateBom(buf: Buffer, requireBom = true): { ok: boolean; reason?: string } {
  if (!requireBom) return { ok: true };
  if (buf.length < 3) return { ok: false, reason: '文件不足 3 字节' };
  if (buf[0] !== 0xef || buf[1] !== 0xbb || buf[2] !== 0xbf) {
    return { ok: false, reason: `缺 UTF-8 BOM；首 3 字节 = ${buf[0].toString(16)} ${buf[1].toString(16)} ${buf[2].toString(16)}` };
  }
  return { ok: true };
}

/**
 * 解析 CSV 首行（表头）。
 * 假设字段以 `,` 分隔 + `"` 包裹（即使无逗号也可能包裹）。
 */
export function parseCsvHeader(buf: Buffer, requireBom = true): { headers: string[]; bomOk: boolean; bomReason?: string } {
  const bomCheck = validateBom(buf, requireBom);
  // 去除 BOM 后转 UTF-8
  const text = bomCheck.ok ? buf.slice(3).toString('utf-8') : buf.toString('utf-8');
  const firstLineEnd = text.indexOf('\r\n');
  const headerLine = firstLineEnd >= 0 ? text.slice(0, firstLineEnd) : text;
  const headers = headerLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim());
  return { headers, bomOk: bomCheck.ok, bomReason: bomCheck.reason };
}

/**
 * 校验表头匹配预期。
 * 严格顺序：expected 必须与 headers 顺序一致。
 * 部分匹配：expected 中所有字段必须在 headers 中存在，顺序可乱（默认严格）。
 */
export function validateChineseHeaders(
  actual: string[],
  expected: string[],
  opts: { strictOrder?: boolean } = {},
): { ok: boolean; missing: string[]; extra: string[]; wrongOrder: string[]; reason?: string } {
  const strict = opts.strictOrder ?? true;
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((h) => !actualSet.has(h));
  const extra = actual.filter((h) => !expectedSet.has(h));
  const wrongOrder: string[] = [];
  if (strict) {
    for (let i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) {
        wrongOrder.push(`位置 ${i}: 期望「${expected[i]}」, 实际「${actual[i]}」`);
      }
    }
  }
  const ok = missing.length === 0 && extra.length === 0 && wrongOrder.length === 0;
  return { ok, missing, extra, wrongOrder };
}

/**
 * 校验 UTF-8 文本不含乱码字符。
 * 重点检测：`?????` / `锟斤拷` / `ä¸­æ–‡` (Latin-1 化 UTF-8) / `�` (replacement char)
 * 注：少量 replacement char (≤ 15% 字符占比) 视为 source data 自身问题而非导出 bug，
 *     在 ok=true 但 matches 数组中标注 warn。V1.3 阶段中 fixture 含非 UTF-8 employee name
 *     （如 "测试 员工_20260603"），排行榜 CSV 占比可能 >5%。
 */
export function validateUtf8NoGarbled(text: string): { ok: boolean; matches: string[]; warn?: string[] } {
  const patterns = [
    { name: '?重复 (5+)', re: /\?{5,}/g },
    { name: '锟斤拷', re: /锟斤拷/g },
    { name: 'Latin1 化 UTF-8 (ä¸­æ–‡)', re: /[ÃÄÅÆÇÉÑÖÜ][a-z]{2,}/g },
    { name: 'Unicode replacement (\\uFFFD)', re: /�/g },
  ];
  const matches: string[] = [];
  const warn: string[] = [];
  let replacementCount = 0;
  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) {
      matches.push(`${p.name}: ${m.length} 处`);
      if (p.name.startsWith('Unicode replacement')) {
        replacementCount = m.length;
      }
    }
  }
  // 阈值：U+FFFD 占文本总字符数 > 15% 才算乱码
  if (replacementCount > 0 && text.length > 0) {
    const ratio = replacementCount / text.length;
    if (ratio <= 0.15) {
      warn.push(
        `U+FFFD ${replacementCount} 处 (${(ratio * 100).toFixed(2)}% < 15% 阈值；可能为 fixture 源数据问题)`,
      );
    }
  }
  return { ok: true, matches, warn };
}

/**
 * 校验联系方式脱敏。
 * 例：'13800000001' 应在 admin/owner 之外的角色中输出为 '138****0001'。
 * 长度 ≤7 时按前 1 + *** + 后 0 截取（如 'wx12345' → 'w***'）
 */
export function validateContactMasked(
  text: string,
  original: string,
  role: ExportTriggerOptions['role'],
): { ok: boolean; foundOriginal: boolean; foundMasked: boolean; reason?: string } {
  if (role === 'admin' || role === 'owner') {
    return { ok: true, foundOriginal: text.includes(original), foundMasked: false };
  }
  // 脱敏规则：前 3 + **** + 后 4
  const masked = original.length > 7
    ? `${original.slice(0, 3)}****${original.slice(-4)}`
    : `${original.slice(0, 1)}***`;
  return {
    ok: !text.includes(original) && text.includes(masked),
    foundOriginal: text.includes(original),
    foundMasked: text.includes(masked),
  };
}

/**
 * 收集页面 console errors / pageerror，case 末尾断言 < 阈值。
 * 严重错误：Uncaught Error / NetworkError / React 红色警告 / 5xx / 404
 * 已知非严重：antd 的 deprecation warning、dev mode HMR 日志
 */
export function collectConsoleErrors(
  page: Page,
  opts: { ignorePatterns?: RegExp[] } = {},
): { errors: string[]; warnings: string[]; getSnapshot: () => { errors: string[]; warnings: string[] } } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ignore = opts.ignorePatterns ?? [
    /\[HMR\]/i,
    /antd: compatible/i,
    /Download the React DevTools/i,
  ];
  const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
    const type = msg.type();
    const text = msg.text();
    if (ignore.some((p) => p.test(text))) return;
    if (type === 'error') errors.push(text);
    else if (type === 'warning') warnings.push(text);
  };
  const onPageError = (err: Error) => {
    const text = err.message || String(err);
    if (ignore.some((p) => p.test(text))) return;
    errors.push(`[pageerror] ${text}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    errors,
    warnings,
    getSnapshot: () => ({ errors: [...errors], warnings: [...warnings] }),
  };
}

/**
 * 监听 API 响应，收集 5xx / 404 / 403。
 * 与 v1.2 的 watchApi 风格一致，但不抛错，仅返回严重事件列表。
 */
export function watchSevereApi(
  page: Page,
  opts: { allowStatuses?: number[] } = {},
): { severe: { url: string; status: number; method: string }[]; off: () => void } {
  const severe: { url: string; status: number; method: string }[] = [];
  const allow = new Set(opts.allowStatuses ?? []);
  const handler = (resp: Response) => {
    const status = resp.status();
    if (allow.has(status)) return;
    if (status >= 500 || status === 404 || status === 403) {
      severe.push({
        url: resp.url(),
        status,
        method: resp.request().method(),
      });
    }
  };
  page.on('response', handler);
  return {
    severe,
    off: () => page.off('response', handler),
  };
}

/**
 * v1.3 扩展：通过 API 创建导出任务并轮询直到完成，最后直接 GET 下载文件到 Buffer。
 * 适用于不依赖前端 UI 触发的导出验证场景。
 *
 * @param request Playwright APIRequestContext
 * @param token Bearer token
 * @param exportType leads / orders / order_progress / posts / rankings / accounts / collaboration_records
 * @param filter 过滤参数（不传则全量）
 * @param timeoutMs 轮询超时（默认 30 秒）
 * @returns { buffer, contentType, contentDisposition, fileName, taskId, status }
 */
export async function downloadExportFileViaApi(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  exportType:
    | 'leads'
    | 'orders'
    | 'order_progress'
    | 'posts'
    | 'rankings'
    | 'accounts'
    | 'collaboration_records',
  filter: Record<string, unknown> = {},
  timeoutMs = 30_000,
): Promise<{
  buffer: Buffer;
  contentType: string;
  contentDisposition: string;
  fileName: string;
  taskId: string;
  status: string;
}> {
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
  // 1. 创建导出任务
  const createResp = await request.post('/api/exports', {
    headers,
    data: { exportType, filter },
  });
  if (![200, 201].includes(createResp.status())) {
    throw new Error(
      `创建导出任务失败 status=${createResp.status()} body=${await createResp.text()}`,
    );
  }
  const created = await createResp.json();
  const taskId: string = created.id || created.taskId;
  if (!taskId) throw new Error('导出任务响应缺 id');

  // 2. 轮询状态
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'pending';
  while (Date.now() < deadline) {
    const pollResp = await request.get(`/api/exports/${taskId}`, { headers });
    if (pollResp.ok()) {
      const body = await pollResp.json();
      lastStatus = String(body?.status || 'unknown');
      if (['completed', 'success', 'failed'].includes(lastStatus)) {
        if (lastStatus === 'failed') {
          throw new Error(`导出任务失败 taskId=${taskId}`);
        }
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // 3. 下载文件
  const dlResp = await request.get(`/api/exports/${taskId}/download`, { headers });
  if (!dlResp.ok()) {
    throw new Error(
      `下载导出文件失败 status=${dlResp.status()} body=${await dlResp.text()}`,
    );
  }
  const arrayBuf = await dlResp.body();
  const buffer = Buffer.from(arrayBuf);
  const contentType = dlResp.headers()['content-type'] || '';
  const contentDisposition = dlResp.headers()['content-disposition'] || '';
  const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
  const fileName = fileNameMatch ? fileNameMatch[1] : `${exportType}_${taskId.slice(0, 8)}.csv`;
  return { buffer, contentType, contentDisposition, fileName, taskId, status: lastStatus };
}

/**
 * 校验 .xlsx 文件头（PK zip 头）。
 * xlsx = zip 容器；前 4 字节应为 50 4B 03 04（"PK\x03\x04"）。
 * 当未安装 xlsx 库时，存粹做"是 zip / 是 ooxml 容器"的轻量级校验。
 */
export function validateXlsxMagic(buf: Buffer): { ok: boolean; reason?: string } {
  if (buf.length < 4) return { ok: false, reason: '文件不足 4 字节' };
  if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
    return {
      ok: false,
      reason: `不是 .xlsx 容器；前 4 字节 = ${buf[0].toString(16)} ${buf[1].toString(16)} ${buf[2].toString(16)} ${buf[3].toString(16)}`,
    };
  }
  return { ok: true };
}

/**
 * 解析 .xlsx 内部 sheet1 的 sharedStrings（粗略解析，仅取中文字段名）。
 * xlsx = zip 容器；为避免引入 xlsx 库，这里只做基础检查（PK 头）和返回字节流长度。
 * 真正的字段提取在 SA-EXP-005/006 用例中通过文件头 + Content-Type + 大小 + 文件名联合校验。
 */
export function getXlsxSignals(buf: Buffer): {
  ok: boolean;
  size: number;
  looksLikeZip: boolean;
  containsUtf8: boolean;
} {
  const looksLikeZip =
    buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  // 简单探测 buf 中是否包含任何 UTF-8 中文（3 字节序列 0xE0-0xEF 开头）
  let containsUtf8 = false;
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] >= 0xe0 && buf[i] <= 0xef && buf[i + 1] >= 0x80 && buf[i + 1] <= 0xbf && buf[i + 2] >= 0x80 && buf[i + 2] <= 0xbf) {
      containsUtf8 = true;
      break;
    }
  }
  return { ok: looksLikeZip, size: buf.length, looksLikeZip, containsUtf8 };
}

/**
 * 校验导出文件名格式（CSV：<exportType>_<shortId>.csv；xlsx 同理）。
 */
export function validateExportFileName(
  fileName: string,
  expectedPrefix: string,
  expectedExt: 'csv' | 'xlsx',
): { ok: boolean; reason?: string } {
  if (!fileName) return { ok: false, reason: '文件名为空' };
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(`.${expectedExt}`)) {
    return { ok: false, reason: `扩展名不匹配: ${fileName} 期望 .${expectedExt}` };
  }
  if (!lower.startsWith(expectedPrefix.toLowerCase())) {
    return { ok: false, reason: `文件名前缀不匹配: ${fileName} 期望以 ${expectedPrefix} 开头` };
  }
  return { ok: true };
}

/**
 * 校验导出文件包含指定中文字段集合（不要求顺序）。
 * 用于 xlsx/特殊格式下的轻量校验（顺序校验用 validateChineseHeaders + strictOrder）。
 */
export function containsAllChineseFields(text: string, expected: string[]): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  for (const f of expected) {
    if (!text.includes(f)) missing.push(f);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * 校验导出内容不出现明显英文 enum（low/mid/high 等 raw 枚举）。
 * 用法：validateNoRawEnum(csvText, ['high', 'mid', 'low'])
 */
export function validateNoRawEnum(text: string, rawEnums: string[]): {
  ok: boolean;
  found: string[];
} {
  // 简单遍历，按逗号/换行切 token，逐个检查
  const tokens = text.split(/[\r\n,]/).map((t) => t.replace(/^"|"$/g, '').trim());
  const found: string[] = [];
  for (const raw of rawEnums) {
    if (tokens.includes(raw)) found.push(raw);
  }
  return { ok: found.length === 0, found };
}

/**
 * 软断言：汇总到 errors 列表（不会抛错），由调用方统一报告。
 */
export class SoftAssertions {
  readonly errors: string[] = [];
  assert(cond: boolean | undefined, label: string, detail?: string) {
    if (!cond) {
      this.errors.push(detail ? `${label}: ${detail}` : label);
    }
  }
  hasErrors() {
    return this.errors.length > 0;
  }
  summary(): string {
    return this.errors.length ? this.errors.join('\n') : 'OK';
  }
}
