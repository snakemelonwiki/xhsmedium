/**
 * scraping-account-setup.js
 *
 * 用途：管理抖音/小红书抓取账号的 Playwright profile 目录与 cookies。
 * 不需要启动 NestJS，直接以 Node.js 脚本运行。
 *
 * 功能：
 *   - create:    初始化空子账号 profile 目录
 *   - copy:      从默认账号复制 cookies 到子账号
 *   - import:    从 JSON cookie 文件导入到 profile 的 Chromium Cookies SQLite
 *   - list:      列出所有账号及登录态（基于 Cookies 文件存在性）
 *   - set-default: 设置某个账号为默认账号
 *   - remove:    删除子账号 profile 目录并更新配置
 *
 * 用法示例：
 *   node scripts/scraping-account-setup.js create --platform douyin --id acc_174002 --label "备用号A"
 *   node scripts/scraping-account-setup.js copy --from default --platform douyin --to acc_174002
 *   node scripts/scraping-account-setup.js list
 */

const fs = require('fs');
const path = require('path');

// 解析仓库根目录（与 backend/src/shared/utils/project-paths.ts 对齐）
function resolveRepoRoot() {
  const ROOT_MARKERS = ['.playwright-profiles', 'server.js', 'backend', 'public'];
  let current = __dirname;
  while (true) {
    if (ROOT_MARKERS.every((m) => fs.existsSync(path.join(current, m)))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // 再往上退 5 级兜底
      return path.resolve(__dirname, '..', '..', '..', '..', '..');
    }
    current = parent;
  }
}

const REPO_ROOT = resolveRepoRoot();
const PROFILE_ROOT = path.join(REPO_ROOT, '.playwright-profiles');
const ACCOUNTS_JSON = path.join(PROFILE_ROOT, 'accounts.json');

// ── 工具函数 ──

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readAccountsJson() {
  if (!fs.existsSync(ACCOUNTS_JSON)) {
    return { version: 1, accounts: [] };
  }
  try {
    const raw = fs.readFileSync(ACCOUNTS_JSON, 'utf-8');
    const json = JSON.parse(raw);
    if (!Array.isArray(json.accounts)) json.accounts = [];
    return json;
  } catch (err) {
    console.error(`读取 accounts.json 失败: ${err.message}`);
    return { version: 1, accounts: [] };
  }
}

function writeAccountsJson(json) {
  fs.writeFileSync(ACCOUNTS_JSON, JSON.stringify(json, null, 2), 'utf-8');
}

function platformCode(p) {
  const map = {
    douyin: 'douyin',
    xiaohongshu: 'xiaohongshu',
    '抖音': 'douyin',
    '小红书': 'xiaohongshu',
  };
  const code = map[String(p || '').trim().toLowerCase()];
  if (!code) {
    throw new Error(`不支持的平台: ${p}，仅支持 douyin/xiaohongshu/抖音/小红书`);
  }
  return code;
}

function displayPlatform(code) {
  return code === 'douyin' ? '抖音' : '小红书';
}

function sanitizeAccountId(id) {
  const s = String(id || '').trim();
  if (!s) {
    throw new Error('账号 ID 不能为空');
  }
  // 禁止路径分隔符和 .. 等危险字符
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) {
    throw new Error(`账号 ID 包含非法字符: ${s}。仅允许字母、数字、下划线、连字符`);
  }
  return s;
}

/**
 * 校验 profileDir 必须位于 PROFILE_ROOT/accounts/<code>/ 子树内，
 * 防止路径遍历导致误删默认目录。
 */
function assertAccountProfileDir(dir, code) {
  const resolvedDir = path.resolve(dir);
  const allowedRoot = path.resolve(path.join(PROFILE_ROOT, 'accounts', code));
  if (!resolvedDir.startsWith(allowedRoot + path.sep) && resolvedDir !== allowedRoot) {
    throw new Error(`路径越界: ${dir} 不在 ${allowedRoot} 子树内`);
  }
}

function defaultProfileDir(code) {
  return path.join(PROFILE_ROOT, code);
}

function accountProfileDir(code, id) {
  const safeId = sanitizeAccountId(id);
  return path.join(PROFILE_ROOT, 'accounts', code, safeId);
}

function getFileSize(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function locateCookies(profileDir) {
  const candidates = [
    path.join(profileDir, 'Default', 'Network', 'Cookies'),
    path.join(profileDir, 'Default', 'Cookies'),
    path.join(profileDir, 'Cookies'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && getFileSize(p) > 0) {
      return p;
    }
  }
  return null;
}

function copyDirSync(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function removeDirSync(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeDirSync(p);
      fs.rmdirSync(p);
    } else {
      fs.unlinkSync(p);
    }
  }
  fs.rmdirSync(dir);
}

// ── CLI 解析 ──

function parseArgs(argv) {
  const args = {};
  let command = '';
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!command && !arg.startsWith('-')) {
      command = arg;
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return { command, args };
}

// ── 命令实现 ──

function cmdCreate({ platform, id, label }) {
  if (!platform || !id) {
    console.error('用法: node scraping-account-setup.js create --platform <douyin|xiaohongshu> --id <accountId> --label <显示名称>');
    process.exit(1);
  }
  const code = platformCode(platform);
  const profileDir = accountProfileDir(code, id);
  ensureDir(profileDir);
  ensureDir(path.join(profileDir, 'Default'));

  const json = readAccountsJson();
  const exists = json.accounts.find((a) => a.id === id && a.platform === code);
  if (exists) {
    console.log(`账号 ${id} (${code}) 已存在，更新配置。`);
    exists.label = label || exists.label;
    exists.profileDir = profileDir;
    exists.enabled = true;
  } else {
    json.accounts.push({
      id,
      platform: code,
      label: label || id,
      profileDir,
      enabled: true,
    });
  }
  writeAccountsJson(json);
  console.log(`✅ 创建账号 ${id} (${displayPlatform(code)})，profile 目录: ${profileDir}`);
}

function cmdCopy({ from, to, platform }) {
  if (!platform || !to) {
    console.error('用法: node scraping-account-setup.js copy --from <default|accountId> --to <accountId> --platform <douyin|xiaohongshu>');
    process.exit(1);
  }
  const code = platformCode(platform);
  const srcDir = from === 'default' ? defaultProfileDir(code) : accountProfileDir(code, from);
  const dstDir = accountProfileDir(code, to);

  if (!fs.existsSync(srcDir)) {
    console.error(`源目录不存在: ${srcDir}`);
    process.exit(1);
  }
  ensureDir(dstDir);

  // 只复制关键文件，避免复制缓存/日志/大文件
  const keyFiles = [
    'Default/Network/Cookies',
    'Default/Cookies',
    'Default/Login Data',
    'Default/Local Storage',
    'Default/Session Storage',
    'Default/IndexedDB',
    'Default/Web Data',
    'Default/Preferences',
    'Default/Secure Preferences',
    'Local State',
    'Network Persistent State',
  ];

  let copied = 0;
  for (const rel of keyFiles) {
    const src = path.join(srcDir, rel);
    const dst = path.join(dstDir, rel);
    if (!fs.existsSync(src)) continue;
    if (fs.statSync(src).isDirectory()) {
      copyDirSync(src, dst);
      copied++;
    } else {
      ensureDir(path.dirname(dst));
      fs.copyFileSync(src, dst);
      copied++;
    }
  }

  // 如果源有 Cookies-journal 也复制
  const journalSrc = path.join(srcDir, 'Default', 'Cookies-journal');
  const journalDst = path.join(dstDir, 'Default', 'Cookies-journal');
  if (fs.existsSync(journalSrc)) {
    ensureDir(path.dirname(journalDst));
    fs.copyFileSync(journalSrc, journalDst);
    copied++;
  }

  // 确保目标账号在配置中存在
  const json = readAccountsJson();
  const exists = json.accounts.find((a) => a.id === to && a.platform === code);
  if (!exists) {
    json.accounts.push({
      id: to,
      platform: code,
      label: to,
      profileDir: dstDir,
      enabled: true,
    });
    writeAccountsJson(json);
  }

  console.log(`✅ 从 ${from} 复制 ${copied} 项关键文件到 ${to} (${displayPlatform(code)})`);
}

/**
 * 把外部 cookie（EditThisCookie / Cookie-Editor / Netscape 等格式）
 * 归一化为 Playwright context.addCookies 所需结构。
 * 返回 null 表示该条无效（缺少 name 或 domain），跳过。
 */
function toPlaywrightCookie(c, code) {
  const domain = String(c.domain || c.host || c.host_key || '').trim();
  const name = String(c.name || c.key || '').trim();
  if (!name || !domain) return null;
  const value = String(c.value ?? '');
  const cookiePath = c.path || '/';

  // 过期时间：优先 expirationDate（unix 秒）。缺省/无效 → session cookie（-1）。
  let expires = Number(c.expirationDate ?? c.expires ?? c.expires_utc ?? -1);
  if (!Number.isFinite(expires) || expires <= 0) expires = -1;

  // sameSite：Playwright 只接受 Strict / Lax / None
  const rawSameSite = String(c.sameSite || c.samesite || '').toLowerCase();
  let sameSite = 'Lax';
  if (rawSameSite === 'none' || rawSameSite === 'no_restriction') sameSite = 'None';
  else if (rawSameSite === 'strict') sameSite = 'Strict';
  else if (rawSameSite === 'lax') sameSite = 'Lax';

  // None 必须搭配 secure=true，否则 Chromium 拒绝写入
  const secure = Boolean(c.secure ?? c.is_secure) || sameSite === 'None';
  const httpOnly = Boolean(c.httpOnly ?? c.httponly ?? c.is_httponly);

  return { name, value, domain, path: cookiePath, expires, httpOnly, secure, sameSite };
}

function requirePlaywrightChromium() {
  // 与 metricsFetcher.js 一致：Windows 下浏览器可能装在 D 盘
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH && process.platform === 'win32') {
    const dDrive = 'D:\\playwright-browsers';
    if (fs.existsSync(dDrive)) process.env.PLAYWRIGHT_BROWSERS_PATH = dDrive;
  }
  // eslint-disable-next-line global-require
  return require('playwright').chromium;
}

function clearSingletonLocks(profileDir) {
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try { fs.rmSync(path.join(profileDir, name), { force: true, recursive: true }); } catch { /* ignore */ }
  }
}

async function cmdImport({ platform, id, file }) {
  if (!platform || !id || !file) {
    console.error('用法: node scraping-account-setup.js import --platform <douyin|xiaohongshu> --id <accountId> --file <cookies.json>');
    console.error('提示：cookies.json 为浏览器扩展（EditThisCookie / Cookie-Editor）导出的 JSON 数组，或 Netscape cookie 文件');
    process.exit(1);
  }
  const code = platformCode(platform);
  const profileDir = accountProfileDir(code, id);
  ensureDir(profileDir);
  ensureDir(path.join(profileDir, 'Default'));

  // 读取 cookie 文件（JSON 数组优先，否则按 Netscape 解析）
  const raw = fs.readFileSync(path.resolve(file), 'utf-8');
  let cookies;
  try {
    cookies = JSON.parse(raw);
    // 兼容 { cookies: [...] } 包装
    if (cookies && !Array.isArray(cookies) && Array.isArray(cookies.cookies)) {
      cookies = cookies.cookies;
    }
  } catch {
    cookies = parseNetscapeCookies(raw);
  }

  if (!Array.isArray(cookies) || cookies.length === 0) {
    console.error('未能解析出有效的 cookies 数组');
    process.exit(1);
  }

  const pwCookies = cookies.map((c) => toPlaywrightCookie(c, code)).filter(Boolean);
  if (pwCookies.length === 0) {
    console.error('cookies 均缺少 name/domain，无法导入');
    process.exit(1);
  }

  // 关键修复：不再手写 SQLite（缺 encrypted_value 会被 Chromium 忽略）。
  // 改用 Playwright 启动持久化 context 后 addCookies，由 Chromium 负责加密落盘。
  const chromium = requirePlaywrightChromium();
  clearSingletonLocks(profileDir);
  const context = await chromium.launchPersistentContext(profileDir, { headless: true });
  try {
    await context.addCookies(pwCookies);
  } finally {
    await context.close();
  }

  // 确保账号在配置中存在
  const json = readAccountsJson();
  const exists = json.accounts.find((a) => a.id === id && a.platform === code);
  if (!exists) {
    json.accounts.push({ id, platform: code, label: id, profileDir, enabled: true });
    writeAccountsJson(json);
  }

  const skipped = cookies.length - pwCookies.length;
  console.log(`✅ 导入 ${pwCookies.length} 条 cookies 到 ${id} (${displayPlatform(code)})${skipped > 0 ? `，跳过 ${skipped} 条无效` : ''}`);
  console.log(`   profile 目录: ${profileDir}`);
}

function cmdList() {
  const json = readAccountsJson();
  if (json.accounts.length === 0) {
    console.log('暂无账号配置，只有默认账号：');
    console.log('  - default (douyin)    → ' + defaultProfileDir('douyin'));
    console.log('  - default (xiaohongshu) → ' + defaultProfileDir('xiaohongshu'));
    return;
  }

  console.log('账号列表:');
  for (const a of json.accounts) {
    const cookiePath = locateCookies(a.profileDir);
    const size = cookiePath ? getFileSize(cookiePath) : 0;
    const status = a.enabled ? (size > 0 ? '🟢 有登录态' : '🔴 无 cookies') : '⚫ 已禁用';
    console.log(`  [${a.platform}] ${a.id}`);
    console.log(`    名称: ${a.label}`);
    console.log(`    目录: ${a.profileDir}`);
    console.log(`    状态: ${status} (${size} bytes)`);
    if (a.isDefault) console.log(`    ⭐ 默认账号`);
  }

  // 同时列出默认账号
  for (const code of ['douyin', 'xiaohongshu']) {
    const dp = defaultProfileDir(code);
    const cookiePath = locateCookies(dp);
    const size = cookiePath ? getFileSize(cookiePath) : 0;
    const status = size > 0 ? '🟢 有登录态' : '🔴 无 cookies';
    console.log(`  [${code}] default (兜底)`);
    console.log(`    目录: ${dp}`);
    console.log(`    状态: ${status} (${size} bytes)`);
  }
}

function cmdSetDefault({ platform, id }) {
  if (!platform || !id) {
    console.error('用法: node scraping-account-setup.js set-default --platform <douyin|xiaohongshu> --id <accountId>');
    process.exit(1);
  }
  const code = platformCode(platform);
  const json = readAccountsJson();
  const target = json.accounts.find((a) => a.id === id && a.platform === code);
  if (!target) {
    console.error(`账号 ${id} (${code}) 不存在`);
    process.exit(1);
  }
  for (const a of json.accounts) {
    if (a.platform === code) a.isDefault = false;
  }
  target.isDefault = true;
  writeAccountsJson(json);
  console.log(`✅ 已将 ${id} 设为 ${displayPlatform(code)} 的默认账号`);
}

function cmdRemove({ platform, id }) {
  if (!platform || !id) {
    console.error('用法: node scraping-account-setup.js remove --platform <douyin|xiaohongshu> --id <accountId>');
    process.exit(1);
  }
  const code = platformCode(platform);
  const profileDir = accountProfileDir(code, id);
  if (fs.existsSync(profileDir)) {
    removeDirSync(profileDir);
  }
  const json = readAccountsJson();
  json.accounts = json.accounts.filter((a) => !(a.id === id && a.platform === code));
  writeAccountsJson(json);
  console.log(`✅ 已删除账号 ${id} (${displayPlatform(code)}) 及其 profile 目录`);
}

// ── 辅助 ──

function parseNetscapeCookies(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  return lines.map((line) => {
    const parts = line.split('\t');
    if (parts.length >= 7) {
      return {
        domain: parts[0],
        name: parts[5],
        value: parts[6],
        path: parts[2],
        expirationDate: parseInt(parts[4], 10) || 0,
        secure: parts[3] === 'TRUE',
      };
    }
    return null;
  }).filter(Boolean);
}

function tryRequire(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

// ── 主入口 ──

const { command, args } = parseArgs(process.argv);

switch (command) {
  case 'create':
    cmdCreate(args);
    break;
  case 'copy':
    cmdCopy(args);
    break;
  case 'import':
    cmdImport(args).catch((err) => {
      console.error(`导入失败: ${err?.message || err}`);
      process.exit(1);
    });
    break;
  case 'list':
    cmdList();
    break;
  case 'set-default':
    cmdSetDefault(args);
    break;
  case 'remove':
    cmdRemove(args);
    break;
  default:
    console.log(`
用法: node scraping-account-setup.js <command> [options]

命令:
  create      初始化空子账号 profile 目录
              --platform <douyin|xiaohongshu> --id <accountId> --label <名称>

  copy        从默认账号或已有账号复制关键 cookies 文件到子账号
              --from <default|accountId> --to <accountId> --platform <douyin|xiaohongshu>

  import      从 JSON/Netscape cookie 文件导入到 profile 的 SQLite Cookies
              --platform <douyin|xiaohongshu> --id <accountId> --file <cookies.json>

  list        列出所有账号及登录态

  set-default 设置某平台默认账号
              --platform <douyin|xiaohongshu> --id <accountId>

  remove      删除子账号 profile 目录并移除配置
              --platform <douyin|xiaohongshu> --id <accountId>
`);
    process.exit(0);
}
