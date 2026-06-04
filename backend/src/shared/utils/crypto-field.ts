import * as crypto from 'crypto';

/**
 * C4-013 草稿加密：使用 AES-256-GCM 加密敏感字段。
 * - 密钥从环境变量 DRAFT_ENCRYPTION_KEY 读取（建议 32 字节随机字符串）
 * - 加密输出格式：iv:authTag:ciphertext（全部 hex）
 * - 解密失败返回原值（兜底，避免老数据/未加密数据被吞）
 *
 * 注意：
 * 1. 同一明文每次加密都不同（IV 随机）
 * 2. GCM 模式自带 authTag，校验完整性
 * 3. 加密/解密失败时必须 throw 上层，调用方决定是否兜底
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bit

function getKey(): Buffer {
  const raw = process.env.DRAFT_ENCRYPTION_KEY || 'change-me-in-env-32bytes!';
  // 取前 32 字节；不足则右侧补 0（仅开发环境兜底，生产环境必须设置 32+ 字节 key）
  const buf = Buffer.alloc(32);
  Buffer.from(raw, 'utf8').copy(buf, 0, 0, Math.min(raw.length, 32));
  return buf;
}

export function encryptField(value: string): string {
  if (value === undefined || value === null) return value as string;
  if (typeof value !== 'string') value = String(value);
  if (!value) return value;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptField(encrypted: string): string {
  if (!encrypted || typeof encrypted !== 'string') return encrypted as string;
  if (!encrypted.includes(':')) return encrypted; // 非加密格式，原样返回
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted;
  const [ivHex, authTagHex, encryptedHex] = parts;
  try {
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // 解密失败：可能是未加密数据 / 密钥错误，兜底返回原值
    return encrypted;
  }
}

/**
 * C4-013 敏感字段集合。命中后自动加密（AES-GCM）。
 * 顺序不影响加密结果。
 */
export const DRAFT_SENSITIVE_FIELDS = [
  'phone',
  'wechat',
  'email',
  'contactInfo',
  'idCard',
] as const;

/**
 * 对 content_json 字符串中的敏感字段加密。
 * - 输入/输出均为 JSON 字符串
 * - 自动加 `<field>_encrypted: true` 标记，便于解密时识别
 * - 解析失败时 throw，由调用方决定兜底
 */
export function encryptContentJson(contentJson: string): string {
  if (!contentJson) return contentJson;
  let obj: any;
  try {
    obj = JSON.parse(contentJson);
  } catch {
    return contentJson; // 非 JSON，原样返回
  }
  if (!obj || typeof obj !== 'object') return contentJson;
  for (const field of DRAFT_SENSITIVE_FIELDS) {
    if (obj[field] && typeof obj[field] === 'string') {
      obj[field] = encryptField(obj[field]);
      obj[`${field}_encrypted`] = true;
    }
  }
  return JSON.stringify(obj);
}

/**
 * 对 content_json 字符串中的敏感字段解密。
 * - 仅对带 `<field>_encrypted: true` 标记的字段解密
 * - 解析失败时 throw
 */
export function decryptContentJson(contentJson: string): string {
  if (!contentJson) return contentJson;
  let obj: any;
  try {
    obj = JSON.parse(contentJson);
  } catch {
    return contentJson;
  }
  if (!obj || typeof obj !== 'object') return contentJson;
  for (const field of DRAFT_SENSITIVE_FIELDS) {
    if (obj[`${field}_encrypted`] && obj[field]) {
      try {
        obj[field] = decryptField(obj[field]);
        delete obj[`${field}_encrypted`];
      } catch {
        // 解密失败保留原密文
      }
    }
  }
  return JSON.stringify(obj);
}
