#!/usr/bin/env node
/*
 * 为历史作品封面生成缩略图并回写 posts.cover_thumb_url。
 *
 * 用法：
 *   node scripts/backfill-post-cover-thumbs.js
 *   node scripts/backfill-post-cover-thumbs.js --write
 *   node scripts/backfill-post-cover-thumbs.js --write --force
 *   node scripts/backfill-post-cover-thumbs.js --write --uploads-root=/var/www/app/uploads
 *
 * 默认 dry-run。仅处理本地旧图片 URL：
 *   /uploads/xxx.png
 *   uploads/xxx.png
 *   http(s)://uploads/xxx.png  # 兼容曾被误归一化的数据
 *   http(s)://localhost:8089/uploads/xxx.png
 *
 * 生成位置：
 *   uploads/post-covers/thumbs/<post-id>.jpg
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const mysql = require('mysql2/promise');

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const FORCE = args.has('--force');
const WIDTH = numberArg('--width', 480);
const QUALITY = numberArg('--quality', 82);
const FFMPEG = resolveFfmpeg();

const repoRoot = path.join(__dirname, '..');
const uploadsRoot = path.resolve(stringArg('--uploads-root=') || process.env.UPLOADS_ROOT || path.join(repoRoot, 'uploads'));
const thumbsDir = path.join(uploadsRoot, 'post-covers', 'thumbs');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'lan_dual_role_system',
  waitForConnections: true,
  connectionLimit: 5,
});

main().catch((err) => {
  console.error('[post-cover-thumbs] failed:', err.message || err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});

async function main() {
  await ensureColumn();
  if (WRITE) fs.mkdirSync(thumbsDir, { recursive: true });

  console.log(`[post-cover-thumbs] write=${WRITE} force=${FORCE} width=${WIDTH} quality=${QUALITY}`);
  console.log(`[post-cover-thumbs] ffmpeg=${FFMPEG}`);
  console.log(`[post-cover-thumbs] uploadsRoot=${uploadsRoot}`);

  const [rows] = await pool.query(`
    SELECT id, cover_image_url, cover_thumb_url
    FROM posts
    WHERE cover_image_url IS NOT NULL
      AND cover_image_url <> ''
      ${FORCE ? '' : "AND (cover_thumb_url IS NULL OR cover_thumb_url = '')"}
    ORDER BY created_at ASC, id ASC
  `);

  let generated = 0;
  let skipped = 0;
  let missing = 0;

  for (const row of rows) {
    const sourcePath = localUploadPath(row.cover_image_url);
    if (!sourcePath) {
      skipped++;
      console.log(`[skip] ${row.id} non-local cover: ${row.cover_image_url}`);
      continue;
    }
    if (!fs.existsSync(sourcePath)) {
      missing++;
      console.log(`[missing] ${row.id} ${sourcePath}`);
      continue;
    }

    const thumbName = `${safeName(row.id)}.jpg`;
    const thumbPath = path.join(thumbsDir, thumbName);
    const thumbUrl = `/uploads/post-covers/thumbs/${thumbName}`;

    if (!WRITE) {
      generated++;
      console.log(`[dry-run] ${row.id} ${row.cover_image_url} -> ${thumbUrl}`);
      continue;
    }

    await makeThumb(sourcePath, thumbPath);
    await pool.query('UPDATE posts SET cover_thumb_url = ? WHERE id = ?', [thumbUrl, row.id]);
    generated++;
    console.log(`[ok] ${row.id} -> ${thumbUrl}`);
  }

  console.log(`[post-cover-thumbs] write=${WRITE} force=${FORCE} generated=${generated} skipped=${skipped} missing=${missing}`);
}

async function ensureColumn() {
  const [rows] = await pool.query(`
    SELECT COUNT(*) AS count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'posts'
      AND COLUMN_NAME = 'cover_thumb_url'
  `);
  if (Number(rows[0]?.count || 0) > 0) return;
  if (!WRITE) {
    throw new Error('posts.cover_thumb_url 不存在；请先运行迁移 M10，或使用 --write 让脚本自动补字段');
  }
  await pool.query("ALTER TABLE posts ADD COLUMN cover_thumb_url VARCHAR(500) NULL COMMENT '封面缩略图URL' AFTER cover_image_url");
  console.log('[post-cover-thumbs] added posts.cover_thumb_url');
}

function localUploadPath(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;

  const uploadsRootResolved = path.resolve(uploadsRoot);
  const rawFilePath = path.resolve(raw);
  if (path.isAbsolute(raw) && isInside(rawFilePath, uploadsRootResolved)) {
    return rawFilePath;
  }

  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.hostname === 'uploads') {
        pathname = parsed.pathname.startsWith('/uploads/')
          ? parsed.pathname
          : `/uploads${parsed.pathname}`;
      } else if (isLocalUploadUrl(parsed)) {
        pathname = parsed.pathname;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  const normalized = pathname.replace(/^\/+/, '');
  if (!normalized.startsWith('uploads/')) return null;
  const relative = normalized.slice('uploads/'.length);
  const resolved = path.resolve(uploadsRoot, relative);
  if (!isInside(resolved, uploadsRootResolved)) return null;
  return resolved;
}

function isLocalUploadUrl(parsed) {
  if (!parsed.pathname.startsWith('/uploads/')) return false;

  const hostname = parsed.hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) return true;

  const localHosts = configuredLocalHosts();
  return localHosts.has(hostname);
}

function configuredLocalHosts() {
  const values = [
    process.env.NEXT_PUBLIC_BACKEND_URL,
    process.env.BACKEND_URL,
    process.env.APP_BASE_URL,
    process.env.API_BASE_URL,
    process.env.VITE_API_BASE_URL,
  ];
  const hosts = new Set();
  for (const value of values) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).hostname.toLowerCase());
    } catch {
      // Ignore non-URL env values; they are not useful for URL host matching.
    }
  }
  return hosts;
}

function isInside(filePath, rootPath) {
  const relative = path.relative(rootPath, filePath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function makeThumb(sourcePath, thumbPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', sourcePath,
      '-vf', `scale=${WIDTH}:-2`,
      '-frames:v', '1',
      '-q:v', String(Math.max(2, Math.min(31, Math.round((100 - QUALITY) / 3.2) + 2))),
      thumbPath,
    ];
    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (err?.code === 'ENOENT') {
        reject(new Error(`找不到 ffmpeg：${FFMPEG}。请安装 ffmpeg 并加入 PATH，或设置 FFMPEG_PATH 指向 ffmpeg.exe`));
        return;
      }
      reject(err);
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function safeName(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120) || `post-${Date.now()}`;
}

function numberArg(name, fallback) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  const parsed = found ? Number(found.slice(prefix.length)) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveFfmpeg() {
  const cliPath = stringArg('--ffmpeg=');
  if (cliPath) return cliPath;
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  const whereResult = process.platform === 'win32'
    ? spawnSync('where.exe', ['ffmpeg'], { encoding: 'utf8' })
    : spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
  const firstFound = whereResult.status === 0
    ? String(whereResult.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    : '';
  if (firstFound && fs.existsSync(firstFound)) return firstFound;

  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = process.platform === 'win32'
    ? [
        'ffmpeg',
        localAppData ? path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe') : '',
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
      ]
    : [
        'ffmpeg',
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/snap/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
        '/usr/local/Cellar/ffmpeg/bin/ffmpeg',
      ];
  for (const candidate of candidates.filter(Boolean).slice(1)) {
    if (fs.existsSync(candidate)) return candidate;
  }

  if (localAppData) {
    const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    const found = findFile(wingetPackages, 'ffmpeg.exe', 5);
    if (found) return found;
  }

  return candidates[0];
}

function stringArg(prefix) {
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
}

function findFile(dir, filename, depth) {
  if (!dir || depth < 0 || !fs.existsSync(dir)) return '';
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return '';
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return full;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findFile(path.join(dir, entry.name), filename, depth - 1);
    if (found) return found;
  }
  return '';
}
