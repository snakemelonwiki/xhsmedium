/**
 * Sanitize 用户输入的文本字段：
 *  - 去除 U+FFFD（替换字符），它通常意味着上游编码已损坏
 *  - 去除 NULL 字节
 *  - 不修改正常的中文 / 英文 / emoji
 *
 * 触发场景：早期 Windows cmd 用 GBK 编码发送的 JSON 被 JSON.parse 强行
 *  当 UTF-8 解析时会把每个非法字节替换成 U+FFFD（0xEFBFBD），导致 DB
 *  里出现"乱码"。前端正常 fetch 提交不会出现这种情况。
 */
export function sanitizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let str = String(value);
  // 去 U+FFFD
  if (str.includes('�')) {
    str = str.replace(/�+/g, '');
  }
  // 去 NULL
  if (str.indexOf('\x00') >= 0) {
    str = str.replace(/\x00/g, '');
  }
  return str;
}

/**
 * 检查是否含已损坏字符。返回 true 时调用方可选择 422 拒绝写入而不是静默清理。
 */
export function hasBrokenEncoding(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).includes('�');
}
