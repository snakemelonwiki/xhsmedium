/**
 * 一键迁移：把旧架构 (D:\webstormProjects\xhsmedium) 的 data.json + uploads/ 灌进新架构的 MySQL。
 *
 * 涉及 6 张表，按 FK 顺序：
 *   employees → users → accounts → posts → leads
 *   notifications / daily-snapshots.json  **不在范围**（见末尾说明）
 *
 * uploads/ 拷贝：把 posts.coverImageUrl 和 leads.captureImageUrl 引用的旧图片
 *   复制到新项目 uploads/ 根目录（保持 /uploads/<filename> 的 URL 约定）。
 *   缩略图生成复用现有 scripts/backfill-post-cover-thumbs.js（用 ffmpeg 缩放）。
 *
 * 字段映射原则：
 *   - 主键 (id) 原样保留（老 UUID "user-xxx" / "emp-xxx" / "acc-xxx" / "post-xxx" / "lead-xxx"），
 *     新表也是 VARCHAR(64)，不丢信息
 *   - camelCase → snake_case（leads.contactInfo → contact_info 等）
 *   - ISO 时间字符串 → MySQL DATETIME（YYYY-MM-DD HH:MM:SS）
 *   - 旧 status 字符串（含中文）原样塞进新 VARCHAR 字段
 *   - 新增的 v1.3 字段（leads.lead_code / intention_level / add_method / deal_status / ...）走 DB 默认
 *
 * 用法：
 *   node scripts/migrate-from-legacy.js                          # 默认从 D:/webstormProjects/xhsmedium 读
 *   node scripts/migrate-from-legacy.js --source=<path>          # 自定义旧项目路径
 *   node scripts/migrate-from-legacy.js --dry-run                # 只统计不写库
 *   node scripts/migrate-from-legacy.js --verbose                # 逐条打印
 *   node scripts/migrate-from-legacy.js --only=posts             # 只跑指定表（逗号分隔）
 *   node scripts/migrate-from-legacy.js --skip-uploads           # 不拷贝 uploads/（默认拷贝）
 *   node scripts/migrate-from-legacy.js --skip-validation        # 跳过迁移后业务关系校验（默认校验）
 *   node scripts/migrate-from-legacy.js --skip-backfill          # 跳过 post_metrics_history.leads_count 回填（默认回填）
 *   node scripts/migrate-from-legacy.js --skip-preflight        # 跳过数据库访问性预检（默认预检）
 *
 * 退出码：
 *   0  全部成功 / 全部已存在（幂等）
 *   2  有失败
 *
 * 已迁移 / 重复记录会被自动跳过（基于主键 SELECT 1），可重复执行。
 * 已拷贝的上传文件会跳过（基于文件名 + size 一致），可重复执行。
 *
 * 全流程建议：
 *   1. node scripts/migrate-from-legacy.js --dry-run   # 先 dry-run 看会做什么
 *   2. node scripts/migrate-from-legacy.js             # 实跑：写库 + 拷 uploads
 *   3. node scripts/backfill-post-cover-thumbs.js --write   # 生成封面缩略图（用 ffmpeg）
 *   4. SELECT COUNT(*) FROM posts WHERE cover_thumb_url IS NOT NULL   # 校验
 */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

// 优先读 backend/.env(本地开发 / 已部署);读不到时再退到根 .env;都没有就用 process.env
const ENV_PATHS = [
  path.resolve(__dirname, "..", "backend", ".env"),
  path.resolve(__dirname, "..", ".env"),
];
let envLoaded = false;
for (const p of ENV_PATHS) {
  if (fs.existsSync(p)) {
    require("dotenv").config({ path: p });
    envLoaded = true;
    break;
  }
}
if (!envLoaded) {
  // 没 .env 时尝试 dotenv 加载(可能由环境变量直接传入),不报错
  require("dotenv").config();
}

// ─── CLI 参数 ────────────────────────────────────────────
function parseArgs(argv) {
  const out = { source: null, dryRun: false, verbose: false, only: null, skipUploads: false, skipValidation: false, skipBackfill: false, skipPreflight: false };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--source=")) out.source = a.slice("--source=".length);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--verbose") out.verbose = true;
    else if (a === "--skip-uploads") out.skipUploads = true;
    else if (a === "--skip-validation") out.skipValidation = true;
    else if (a === "--skip-backfill") out.skipBackfill = true;
    else if (a === "--skip-preflight") out.skipPreflight = true;
    else if (a.startsWith("--only=")) out.only = a.slice("--only=".length).split(",").map((s) => s.trim());
    else if (a === "--help" || a === "-h") {
      console.log(fs.readFileSync(__filename, "utf8").split("\n").filter((l) => l.startsWith(" *")).join("\n"));
      process.exit(0);
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const DEFAULT_SOURCE = "D:/webstormProjects/xhsmedium";
const SOURCE = args.source || DEFAULT_SOURCE;
const DATA_FILE = path.join(SOURCE, "data.json");

// ─── 时间格式转换 ────────────────────────────────────────
function toMysqlDatetime(iso) {
  if (!iso) return null;
  const s = String(iso);
  // "2026-04-20T10:16:49.927Z" → "2026-04-20 10:16:49"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  // 已经是 "YYYY-MM-DD HH:MM:SS" 原样返回
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 19);
  return null;
}

function toMysqlDate(iso) {
  if (!iso) return null;
  const s = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// ─── 通用 INSERT 辅助 ────────────────────────────────────
async function insertIfNotExists(conn, table, row, pk = "id", verbose) {
  const [exists] = await conn.execute(`SELECT 1 FROM \`${table}\` WHERE \`${pk}\` = ? LIMIT 1`, [row[pk]]);
  if (exists.length > 0) {
    return { status: "skipped", reason: "exists" };
  }
  if (args.dryRun) {
    return { status: "would-insert" };
  }
  const cols = Object.keys(row);
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(",")}) VALUES (${placeholders})`;
  await conn.execute(sql, cols.map((c) => row[c]));
  return { status: "inserted" };
}

// ─── 每张表的迁移函数 ────────────────────────────────────
function mapEmployee(emp) {
  if (!emp.id || !emp.employeeCode || !emp.name) return null;
  return {
    id: emp.id,
    employee_code: emp.employeeCode,
    name: emp.name,
    phone: emp.phone || null,
    hire_date: toMysqlDate(emp.hireDate),
    status: emp.status || "在职",
    created_at: toMysqlDatetime(emp.createdAt),
    updated_at: toMysqlDatetime(emp.updatedAt),
  };
}

function mapUser(u) {
  if (!u.id || !u.username) return null;
  return {
    id: u.id,
    username: u.username,
    password: u.password,
    role: u.role || "staff",
    employee_id: u.employeeId || null,
    status: u.status || "active",
    created_at: toMysqlDatetime(u.createdAt),
    updated_at: toMysqlDatetime(u.updatedAt),
  };
}

function mapAccount(a) {
  if (!a.id || !a.employeeId || !a.accountName) return null;
  return {
    id: a.id,
    employee_id: a.employeeId,
    platform: a.platform,
    profile_url: a.profileUrl || null,
    account_name: a.accountName,
    account_uid: a.accountUid || null,
    persona: a.persona || null,
    positioning: a.positioning || null,
    posting_plan: a.postingPlan || null,
    status: a.status || "正常",
    created_at: toMysqlDatetime(a.createdAt),
    updated_at: toMysqlDatetime(a.updatedAt),
  };
}

function mapPost(p) {
  if (!p.id || !p.employeeId || !p.accountId || !p.platform || !p.title) return null;
  return {
    id: p.id,
    employee_id: p.employeeId,
    account_id: p.accountId,
    platform: p.platform,
    title: p.title,
    copywriting: p.copywriting || null,
    cover_image_url: p.coverImageUrl || null,
    cover_thumb_url: p.coverThumbUrl || null,
    post_url: p.postUrl || null,
    post_type: p.postType || "素人贴",
    traffic: Number(p.traffic || 0),
    likes: Number(p.likes || 0),
    comments: Number(p.comments || 0),
    favorites: Number(p.favorites || 0),
    shares: Number(p.shares || 0),
    metrics_updated_at: toMysqlDatetime(p.metricsUpdatedAt),
    published_at: toMysqlDate(p.publishedAt) || "1970-01-01",
    note: p.note || null,
    supervisor_suggestion: p.supervisorSuggestion || null,
    created_at: toMysqlDatetime(p.createdAt),
    updated_at: toMysqlDatetime(p.updatedAt),
    is_supervisor_picked: 0,
  };
}

function mapLead(l) {
  // 关键字段缺失 → 返回 null,主循环会标记为 orphan
  if (!l.id || !l.employeeId || !l.accountId || !l.platform) {
    return null;
  }
  return {
    id: l.id,
    employee_id: l.employeeId,
    account_id: l.accountId,
    post_id: l.postId || null,
    platform: l.platform,
    contact_info: l.contactInfo || "",
    nickname: l.nickname || null,
    budget: l.budget || null,
    major_content: l.majorContent || null,
    ip: l.ip || null,
    status: l.status || "新客资",
    deal_amount: l.dealAmount ? Number(l.dealAmount) : null,
    note: l.note || null,
    capture_image_url: l.captureImageUrl || null,
    sales_feedback: l.salesFeedback || null,
    sales_updated_at: toMysqlDatetime(l.salesUpdatedAt),
    sales_user_name: l.salesUserName || null,
    assigned_sales_user_id: l.assignedSalesUserId || null,
    assigned_sales_user_name: l.assignedSalesUserName || null,
    process_status: l.processStatus || "未接",
    add_status: l.addStatus || "未添加",
    intention: l.intention || null,
    created_at: toMysqlDatetime(l.createdAt),
    updated_at: toMysqlDatetime(l.updatedAt),
  };
}

async function migrateTable(conn, tableName, items, mapper, summary) {
  if (!items || items.length === 0) {
    summary[tableName] = { inserted: 0, skipped: 0, failed: 0, orphan: 0, total: 0 };
    return;
  }
  let inserted = 0, skipped = 0, failed = 0, orphan = 0;
  const orphanList = [];
  for (const raw of items) {
    try {
      const row = mapper(raw);
      // 关键字段缺失 → 标记 orphan,不入库;在末尾汇总报告
      if (!row) {
        orphan += 1;
        orphanList.push(raw.id || "(no id)");
        if (args.verbose) console.log(`  ◌ [${tableName}] orphan: missing required field(s), ${JSON.stringify(raw).slice(0, 120)}`);
        continue;
      }
      if (!row.id) {
        failed += 1;
        if (args.verbose) console.log(`  ✗ [${tableName}] missing id: ${JSON.stringify(raw).slice(0, 80)}`);
        continue;
      }
      const r = await insertIfNotExists(conn, tableName, row, "id", args.verbose);
      if (r.status === "inserted") inserted += 1;
      else if (r.status === "skipped") skipped += 1;
      else if (r.status === "would-insert") inserted += 1;
      if (args.verbose && r.status !== "skipped") {
        console.log(`  ${r.status === "would-insert" ? "○" : "✓"} [${tableName}] ${row.id} (${row.username || row.name || row.title || row.account_name || row.contact_info || ""})`);
      }
    } catch (e) {
      failed += 1;
      if (args.verbose) {
        console.log(`  ✗ [${tableName}] ${raw.id || "(no id)"} → ${e.message}`);
        if (e.message.includes("undefined")) {
          for (const [k, v] of Object.entries(row)) {
            if (v === undefined) console.log(`     undefined: ${k}`);
          }
        }
      }
    }
  }
  summary[tableName] = { inserted, skipped, failed, orphan, orphanList, total: items.length };
}

// ─── uploads 拷贝 ───────────────────────────────────────
function collectReferencedFiles(data) {
  const files = new Map(); // basename -> ['post' | 'lead' | 'both']
  for (const p of data.posts || []) {
    if (!p.coverImageUrl) continue;
    const base = path.basename(p.coverImageUrl);
    if (!base || base === "." || base === "/") continue;
    const cur = files.get(base);
    files.set(base, { sources: cur ? `${cur.sources}+post` : "post", url: p.coverImageUrl });
  }
  for (const l of data.leads || []) {
    if (!l.captureImageUrl) continue;
    const base = path.basename(l.captureImageUrl);
    if (!base || base === "." || base === "/") continue;
    const cur = files.get(base);
    files.set(base, { sources: cur ? `${cur.sources}+lead` : "lead", url: l.captureImageUrl });
  }
  return files;
}

async function copyUploads(referencedFiles) {
  const sourceUploads = path.join(SOURCE, "uploads");
  const targetUploads = path.join(__dirname, "..", "uploads");
  if (!fs.existsSync(sourceUploads)) {
    console.log(`  ✗ 源 uploads 目录不存在：${sourceUploads}`);
    return { copied: 0, skipped: 0, missing: 0, total: 0 };
  }
  fs.mkdirSync(targetUploads, { recursive: true });

  let copied = 0, skipped = 0, missing = 0;
  const total = referencedFiles.size;

  for (const [base, meta] of referencedFiles.entries()) {
    const src = path.join(sourceUploads, base);
    const dst = path.join(targetUploads, base);
    if (!fs.existsSync(src)) {
      missing += 1;
      if (args.verbose) console.log(`  ✗ [missing] ${base} (ref: ${meta.sources})`);
      continue;
    }
    if (fs.existsSync(dst)) {
      // 幂等：目标已存在 + size 一致 → 跳过；否则覆盖
      const srcSize = fs.statSync(src).size;
      const dstSize = fs.statSync(dst).size;
      if (srcSize === dstSize) {
        skipped += 1;
        if (args.verbose) console.log(`  ○ [skip] ${base} (ref: ${meta.sources}, ${srcSize} bytes)`);
        continue;
      }
    }
    if (args.dryRun) {
      copied += 1;
      if (args.verbose) console.log(`  ○ [would-copy] ${base} (ref: ${meta.sources})`);
      continue;
    }
    fs.copyFileSync(src, dst);
    copied += 1;
    if (args.verbose) console.log(`  ✓ [copy] ${base} (ref: ${meta.sources})`);
  }
  return { copied, skipped, missing, total };
}

// ─── 数据库访问性预检 ─────────────────────────────────────
/**
 * 包装 mysql.createConnection,把常见错误码翻译成中文。
 * 这样用户在配置错误时不用看 ECONNREFUSED / Unknown database / ER_ACCESS_DENIED_ERROR 原始信息。
 */
async function connectWithChecks(config) {
  try {
    const conn = await mysql.createConnection(config);
    return { conn, error: null };
  } catch (e) {
    let friendly = e.message;
    let hint = "";
    if (e.code === "ECONNREFUSED" || e.errno === -111) {
      friendly = `MySQL ${config.host}:${config.port} 连不上`;
      hint = "检查 .env 的 MYSQL_HOST/PORT,确认 MySQL 服务已启动";
    } else if (e.code === "ENOTFOUND") {
      friendly = `MySQL 主机 ${config.host} DNS 解析失败`;
      hint = "检查 MYSQL_HOST 是否拼写正确,或网络是否能访问该主机";
    } else if (e.code === "ER_ACCESS_DENIED_ERROR" || e.errno === 1045) {
      friendly = `MySQL 用户认证失败`;
      hint = "检查 .env 的 MYSQL_USER / MYSQL_PASSWORD,确认用户有足够权限";
    } else if (e.code === "ER_BAD_DB_ERROR" || e.errno === 1049) {
      friendly = `数据库 ${config.database} 不存在`;
      hint = `先 CREATE DATABASE ${config.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; 或检查 .env 的 MYSQL_DATABASE`;
    } else if (e.code === "ETIMEDOUT" || e.code === "PROTOCOL_CONNECTION_LOST") {
      friendly = `MySQL 连接超时`;
      hint = "网络慢或 MySQL 负载高,可加大 connectTimeout 或排查网络";
    }
    return { conn: null, error: friendly, hint, code: e.code };
  }
}

/**
 * 连接建立后立刻跑的预检,失败立即退出 2。
 *
 * 5 项检查：
 *   1. SELECT 1  → 确认连接有效
 *   2. VERSION() → 报告 MySQL 版本(业务要求 >= 5.7)
 *   3. 5 张目标表存在 → 缺表时提示先跑 backend migrations
 *   4. 权限满足 → SELECT / INSERT / UPDATE / DELETE 都得有
 *   5. 当前 DB 行数 → 让用户知道当前库状态
 */
async function preflightCheck(conn) {
  const checks = [];
  const push = (level, msg) => checks.push({ level, msg });

  // 1. SELECT 1
  try {
    const [rows] = await conn.query("SELECT 1 AS ok");
    if (rows[0]?.ok === 1) push("ok", "SELECT 1 正常");
    else push("error", `SELECT 1 返回异常: ${JSON.stringify(rows)}`);
  } catch (e) {
    push("error", `SELECT 1 失败: ${e.message}`);
    return { checks, errors: 1, warnings: 0 };
  }

  // 2. MySQL 版本
  try {
    const [rows] = await conn.query("SELECT VERSION() AS v");
    const v = String(rows[0].v);
    push("ok", `MySQL 版本: ${v}`);
    // 简单 major.minor 解析
    const m = v.match(/^(\d+)\.(\d+)/);
    if (m) {
      const major = Number(m[1]);
      const minor = Number(m[2]);
      if (major < 5 || (major === 5 && minor < 7)) {
        push("warning", `MySQL ${v} < 5.7,JSON 列等特性可能不可用`);
      }
    }
  } catch (e) {
    push("warning", `读 MySQL 版本失败: ${e.message}`);
  }

  // 3. 5 张目标表 + 1 张 backfill 表
  const targetTables = ["employees", "users", "accounts", "posts", "leads"];
  for (const t of targetTables) {
    const [rows] = await conn.query("SHOW TABLES LIKE ?", [t]);
    if (rows.length === 0) {
      push("error", `目标表 ${t} 不存在 — 需先跑 backend migrations 初始化 schema`);
    } else {
      push("ok", `目标表 ${t} 存在`);
    }
  }
  {
    const [rows] = await conn.query("SHOW TABLES LIKE 'post_metrics_history'");
    if (rows.length === 0) {
      push("warning", `post_metrics_history 不存在 — backfill 步骤会无效果,但不阻塞`);
    } else {
      push("ok", `post_metrics_history 存在(backfill 目标)`);
    }
  }

  // 4. 权限:试一行 SELECT,对每张表通过说明 SELECT 通过
  for (const t of targetTables) {
    try {
      await conn.query(`SELECT 1 FROM \`${t}\` LIMIT 0`);
      // 不打印 OK,会被下面 currentRowCounts 覆盖;失败时单报
    } catch (e) {
      push("error", `${t} SELECT 权限不足: ${e.message}`);
    }
  }
  // 测 INSERT 权限:用 SAVEPOINT 试探(不真写)
  try {
    await conn.beginTransaction();
    try {
      await conn.query("INSERT INTO `employees` (id, employee_code, name) VALUES ('__preflight__', '__preflight__', '__preflight__')");
      await conn.query("DELETE FROM `employees` WHERE id = '__preflight__'");
    } finally {
      await conn.rollback();
    }
    push("ok", "INSERT/DELETE 权限满足(试探 INSERT + DELETE 后回滚)");
  } catch (e) {
    push("error", `INSERT/DELETE 权限不足: ${e.message}`);
  }
  // 测 UPDATE 权限(在 post_metrics_history 上)
  try {
    const [rows] = await conn.query("SHOW TABLES LIKE 'post_metrics_history'");
    if (rows.length > 0) {
      await conn.query("UPDATE `post_metrics_history` SET leads_count = leads_count WHERE 1 = 0");
      push("ok", "UPDATE 权限满足(试探无变化 UPDATE)");
    }
  } catch (e) {
    push("error", `UPDATE 权限不足: ${e.message}`);
  }

  // 5. 当前行数
  for (const t of [...targetTables, "post_metrics_history"]) {
    try {
      const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      push("ok", `当前 ${t} 行数: ${rows[0].n}`);
    } catch (e) {
      // 表不存在就跳过(已在第 3 步报错)
    }
  }

  const errors = checks.filter((c) => c.level === "error").length;
  const warnings = checks.filter((c) => c.level === "warning").length;
  return { checks, errors, warnings };
}

// ─── 业务关系校验（迁移后跑一遍）────────────────────────
/**
 * 6 类检查：
 *   A. 必填字段全非空（NOT NULL 列）
 *   B. 外键孤儿（LEFT JOIN 找 target=NULL）
 *   C. 业务规则（平台一致、数值非负、日期合理）
 *   D. 状态/角色 ENUM 合法
 *   E. 唯一约束（username / employee_code）
 *   F. 跨表计数 sanity
 *
 * 返回 { errors, warnings, checks[] }。
 * 有 error 才会让 process.exit(2)，warning 仅报告。
 */
async function validateBusinessRules(conn, expectedCounts) {
  const checks = [];
  const push = (level, msg) => checks.push({ level, msg });

  // 单 check 包装:SQL 报错不阻塞其他 check,只记 error
  const check = async (fn) => {
    try { await fn(); } catch (e) { push("error", `校验查询异常: ${e.message}`); }
  };

  // A. 必填字段非空（应已被 mapper 防护，但 DB 层也兜底）
  const requiredChecks = [
    { t: "employees", cols: ["id", "employee_code", "name", "status"] },
    { t: "users",     cols: ["id", "username", "password", "role", "status"] },
    { t: "accounts",  cols: ["id", "employee_id", "platform", "account_name", "status"] },
    { t: "posts",     cols: ["id", "employee_id", "account_id", "platform", "title", "post_type", "published_at"] },
    { t: "leads",     cols: ["id", "employee_id", "account_id", "platform", "contact_info", "status", "process_status", "add_status"] },
  ];
  for (const { t, cols } of requiredChecks) {
    for (const col of cols) {
      await check(async () => {
        // DATE / DATETIME 列空字符串会导致比较报错,用 NULL-safe 比较
        const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM ${t} WHERE ${col} IS NULL OR TRIM(CAST(${col} AS CHAR)) = ''`);
        const n = Number(rows[0].n);
        if (n > 0) push("error", `${t}.${col} 空值 ${n} 条`);
        else push("ok", `${t}.${col} 非空`);
      });
    }
  }

  // B. 外键孤儿
  const fkChecks = [
    { t: "users",    fk: "employee_id", target: "employees" },
    { t: "accounts", fk: "employee_id", target: "employees" },
    { t: "posts",    fk: "employee_id", target: "employees" },
    { t: "posts",    fk: "account_id",  target: "accounts"  },
    { t: "leads",    fk: "employee_id", target: "employees" },
    { t: "leads",    fk: "account_id",  target: "accounts"  },
  ];
  for (const { t, fk, target } of fkChecks) {
    await check(async () => {
      const [rows] = await conn.query(
        `SELECT COUNT(*) AS n FROM ${t} t LEFT JOIN ${target} k ON t.${fk} = k.id WHERE k.id IS NULL`,
      );
      const n = Number(rows[0].n);
      if (n > 0) push("error", `${t}.${fk} → ${target} 孤儿 ${n} 条`);
      else push("ok", `${t}.${fk} → ${target} 全部命中`);
    });
  }
  // leads.post_id 可空,只统计非空的孤儿
  await check(async () => {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS n FROM leads t LEFT JOIN posts k ON t.post_id = k.id WHERE t.post_id IS NOT NULL AND k.id IS NULL`,
    );
    const n = Number(rows[0].n || 0);
    if (n > 0) push("error", `leads.post_id → posts 孤儿 ${n} 条`);
    else push("ok", `leads.post_id → posts 全部命中`);
  });

  // C. 业务规则
  await check(async () => {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS n FROM posts p JOIN accounts a ON p.account_id = a.id WHERE p.platform <> a.platform`,
    );
    const n = Number(rows[0].n);
    if (n > 0) push("warning", `posts.platform ≠ accounts.platform ${n} 条`);
    else push("ok", `posts.platform 一致`);
  });
  await check(async () => {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS n FROM leads l JOIN accounts a ON l.account_id = a.id WHERE l.platform <> a.platform`,
    );
    const n = Number(rows[0].n);
    if (n > 0) push("warning", `leads.platform ≠ accounts.platform ${n} 条`);
    else push("ok", `leads.platform 一致`);
  });
  // C2. 数值非负
  await check(async () => {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS n FROM posts WHERE likes < 0 OR comments < 0 OR favorites < 0 OR shares < 0 OR traffic < 0`,
    );
    const n = Number(rows[0].n);
    if (n > 0) push("error", `posts 互动数值 < 0 共 ${n} 条`);
    else push("ok", `posts 互动数值 ≥ 0`);
  });
  await check(async () => {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS n FROM accounts WHERE account_name = '' OR platform = ''`,
    );
    const n = Number(rows[0].n);
    if (n > 0) push("error", `accounts 名称或平台空值 ${n} 条`);
    else push("ok", `accounts 名称+平台非空`);
  });
  // C3. 日期合理性:DATE 列可能有空字符串导致 < 比较失败,过滤掉
  await check(async () => {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS n FROM posts WHERE published_at IS NOT NULL AND (published_at < '2020-01-01' OR published_at > DATE_ADD(CURDATE(), INTERVAL 1 DAY))`,
    );
    const n = Number(rows[0].n);
    if (n > 0) push("warning", `posts.published_at 异常（< 2020-01-01 或 > 明天）${n} 条`);
    else push("ok", `posts.published_at 在合理区间`);
  });
  // C4. 时间戳顺序
  await check(async () => {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS n FROM posts WHERE created_at > updated_at`,
    );
    const n = Number(rows[0].n);
    if (n > 0) push("warning", `posts 时间倒序（created > updated）${n} 条`);
    else push("ok", `posts 时间顺序正常`);
  });
  await check(async () => {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS n FROM leads WHERE created_at > updated_at`,
    );
    const n = Number(rows[0].n);
    if (n > 0) push("warning", `leads 时间倒序（created > updated）${n} 条`);
    else push("ok", `leads 时间顺序正常`);
  });

  // D. 状态/角色 ENUM 合法
  await check(async () => {
    const validRoles = new Set(["admin", "staff", "sales", "academic", "owner", "operation", "supervisor"]);
    const [rows] = await conn.query(`SELECT DISTINCT role FROM users`);
    const bad = rows.map((r) => r.role).filter((r) => !validRoles.has(r));
    if (bad.length > 0) push("error", `users.role 非法值：${bad.join(", ")}`);
    else push("ok", `users.role 全部合法`);
  });
  await check(async () => {
    const validUserStatus = new Set(["active", "inactive", "locked"]);
    const [rows] = await conn.query(`SELECT DISTINCT status FROM users`);
    const bad = rows.map((r) => r.status).filter((s) => !validUserStatus.has(s));
    if (bad.length > 0) push("error", `users.status 非法值：${bad.join(", ")}`);
    else push("ok", `users.status 全部合法`);
  });
  await check(async () => {
    const validEmpStatus = new Set(["在职", "停用"]);
    const [rows] = await conn.query(`SELECT DISTINCT status FROM employees`);
    const bad = rows.map((r) => r.status).filter((s) => !validEmpStatus.has(s));
    if (bad.length > 0) push("warning", `employees.status 异常值：${bad.join(", ")}（非在职/停用）`);
    else push("ok", `employees.status 全部合法`);
  });
  await check(async () => {
    const validAccStatus = new Set(["正常", "停用"]);
    const [rows] = await conn.query(`SELECT DISTINCT status FROM accounts`);
    const bad = rows.map((r) => r.status).filter((s) => !validAccStatus.has(s));
    if (bad.length > 0) push("warning", `accounts.status 异常值：${bad.join(", ")}（非正常/停用）`);
    else push("ok", `accounts.status 全部合法`);
  });

  // E. 唯一约束
  await check(async () => {
    const [rows] = await conn.query(
      `SELECT username, COUNT(*) AS n FROM users GROUP BY username HAVING n > 1`,
    );
    if (rows.length > 0) push("error", `users.username 重复：${rows.map((r) => `${r.username}(${r.n})`).join(", ")}`);
    else push("ok", `users.username 唯一`);
  });
  await check(async () => {
    const [rows] = await conn.query(
      `SELECT employee_code, COUNT(*) AS n FROM employees GROUP BY employee_code HAVING n > 1`,
    );
    if (rows.length > 0) push("error", `employees.employee_code 重复：${rows.map((r) => `${r.employee_code}(${r.n})`).join(", ")}`);
    else push("ok", `employees.employee_code 唯一`);
  });

  // F. 跨表计数 sanity
  for (const [t, expected] of Object.entries(expectedCounts)) {
    await check(async () => {
      const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM ${t}`);
      const n = Number(rows[0].n);
      if (n < expected) push("warning", `${t} DB=${n} < 源数据 ${expected}（部分记录未迁入，正常）`);
      else push("ok", `${t} DB=${n} ≥ 源数据 ${expected}`);
    });
  }

  const errors = checks.filter((c) => c.level === "error").length;
  const warnings = checks.filter((c) => c.level === "warning").length;
  return { errors, warnings, checks };
}

// ─── post_metrics_history.leads_count 回填 ─────────────────────
/**
 * 迁移漏掉的一步:每条 post 的 leads_count 没被算入。
 * 旧 data.json 里 leads[].postId 已经知道哪条 lead 属于哪个 post,迁完之后
 * 真实数据已经在 leads 表,跑一次 GROUP BY 回填即可。
 *
 * 注:post_metrics 表**没有** leads_count 列(只 post_metrics_history 有),无需管。
 *
 * 幂等:先全表重置为 0,再 GROUP BY 重算。重复跑结果一致。
 */
async function backfillLeadsCount(conn) {
  // 1. 先把 leads_count 全表重置为 0(避免老数据残留,特别是脚本跑过多次时)
  const [resetResult] = await conn.query("UPDATE post_metrics_history SET leads_count = 0");
  // 2. 重新计算并回填
  const [updateResult] = await conn.query(`
    UPDATE post_metrics_history h
    JOIN (
      SELECT post_id, COUNT(*) AS n
      FROM leads
      WHERE post_id IS NOT NULL
      GROUP BY post_id
    ) c ON h.post_id = c.post_id
    SET h.leads_count = c.n
  `);
  // 3. 统计效果
  const [stats] = await conn.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN leads_count > 0 THEN 1 ELSE 0 END) AS with_leads,
      SUM(leads_count) AS sum_leads
    FROM post_metrics_history
  `);
  return {
    rowsReset: resetResult.affectedRows,
    rowsUpdated: updateResult.affectedRows,
    total: Number(stats[0].total || 0),
    withLeads: Number(stats[0].with_leads || 0),
    sumLeads: Number(stats[0].sum_leads || 0),
  };
}

// ─── 主流程 ──────────────────────────────────────────────
async function main() {
  console.log("=== Legacy → MySQL 一键迁移 ===");
  console.log(`source:    ${SOURCE}`);
  console.log(`data.json: ${DATA_FILE} ${fs.existsSync(DATA_FILE) ? "✓" : "✗ 不存在"}`);
  console.log(`dry-run:   ${args.dryRun}`);
  console.log(`only:      ${args.only ? args.only.join(",") : "(全部)"}`);
  console.log();

  if (!fs.existsSync(DATA_FILE)) {
    console.error(`✗ data.json 不存在：${DATA_FILE}`);
    process.exit(2);
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  console.log(`源数据：users=${data.users.length}  employees=${data.employees.length}  accounts=${data.accounts.length}  posts=${data.posts.length}  leads=${data.leads.length}  notifications=${data.notifications.length}`);
  console.log();

  // ─── 数据库连接(友好错误)────────────────────────────
  const connConfig = {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    connectTimeout: 5000,  // 5s 内连不上就放弃,避免长时间挂起
  };
  const { conn, error: connError, hint: connHint } = await connectWithChecks(connConfig);
  if (!conn) {
    console.error(`✗ 数据库连接失败: ${connError}`);
    if (connHint) console.error(`  提示: ${connHint}`);
    process.exit(2);
  }
  console.log(`✓ 已连上 MySQL: ${connConfig.host}:${connConfig.port}/${connConfig.database} (connectTimeout=${connConfig.connectTimeout}ms)`);

  // ─── 数据库预检 ─────────────────────────────────────
  let preflightErrors = 0;
  if (args.skipPreflight) {
    console.log("\n[preflight] --skip-preflight 已指定,跳过访问性预检");
  } else {
    console.log("\n[preflight] 探测数据库访问性...");
    const t0 = Date.now();
    const pf = await preflightCheck(conn);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    preflightErrors = pf.errors;
    console.log(`[preflight] ${pf.checks.length} checks, errors=${pf.errors} warnings=${pf.warnings} (${dt}s)\n`);
    for (const c of pf.checks) {
      const mark = c.level === "ok" ? "✓" : c.level === "warning" ? "⚠" : "✗";
      console.log(`  ${mark} [${c.level.padEnd(7)}] ${c.msg}`);
    }
    if (pf.errors > 0) {
      console.log(`\n[preflight] ✗ 预检有 ${pf.errors} 个 error,终止迁移`);
      await conn.end();
      process.exit(2);
    }
    console.log(`\n[preflight] ✓ 通过,可以开始迁移`);
  }
  console.log();

  const summary = {};
  const steps = [
    ["employees", data.employees, mapEmployee],
    ["users", data.users, mapUser],
    ["accounts", data.accounts, mapAccount],
    ["posts", data.posts, mapPost],
    ["leads", data.leads, mapLead],
  ];
  for (const [name, items, mapper] of steps) {
    if (args.only && !args.only.includes(name)) continue;
    process.stdout.write(`[${name}] migrating ${items.length} rows... `);
    const t0 = Date.now();
    await migrateTable(conn, name, items, mapper, summary);
    const s = summary[name];
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`inserted=${s.inserted} skipped=${s.skipped} failed=${s.failed} (${dt}s)`);
  }

  console.log("\n=== 总结 ===");
  let totalInserted = 0, totalSkipped = 0, totalFailed = 0, totalOrphan = 0;
  for (const k of Object.keys(summary)) {
    const s = summary[k];
    console.log(`  ${k.padEnd(12)}  insert=${String(s.inserted).padStart(4)}  skip=${String(s.skipped).padStart(4)}  fail=${String(s.failed).padStart(4)}  orphan=${String(s.orphan || 0).padStart(4)}  total=${s.total}`);
    totalInserted += s.inserted;
    totalSkipped += s.skipped;
    totalFailed += s.failed;
    totalOrphan += s.orphan || 0;
  }
  console.log(`  ${"合计".padEnd(12)}  insert=${String(totalInserted).padStart(4)}  skip=${String(totalSkipped).padStart(4)}  fail=${String(totalFailed).padStart(4)}  orphan=${String(totalOrphan).padStart(4)}`);

  // 打印 orphan 列表(关键字段缺失但 id 存在的记录)
  if (totalOrphan > 0) {
    console.log("\n=== Orphan 列表（缺关键字段，未入库）===");
    for (const k of Object.keys(summary)) {
      const ol = summary[k].orphanList || [];
      if (ol.length > 0) {
        console.log(`  [${k}]`);
        for (const id of ol) console.log(`    - ${id}`);
      }
    }
  }

  // ─── uploads 拷贝 ─────────────────────────────────────
  if (args.skipUploads) {
    console.log("\n[uploads] --skip-uploads 已指定，跳过拷贝");
  } else {
    const referenced = collectReferencedFiles(data);
    console.log(`\n[uploads] 引用了 ${referenced.size} 个文件，准备从 ${path.join(SOURCE, "uploads")} 拷贝到 ${path.join(__dirname, "..", "uploads")}`);
    const t0 = Date.now();
    const r = await copyUploads(referenced);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[uploads] copy=${r.copied} skip=${r.skipped} missing=${r.missing} total=${r.total} (${dt}s)`);
    if (r.missing > 0) console.log(`[uploads] ⚠ ${r.missing} 个文件在源目录找不到，需手动找回`);
  }

  // ─── 业务关系校验 ─────────────────────────────────────
  let validationErrors = 0;
  let validationWarnings = 0;
  if (args.dryRun) {
    console.log("\n[validation] dry-run 模式跳过业务关系校验（数据未真写入，FK 校验无意义）");
  } else if (args.skipValidation) {
    console.log("\n[validation] --skip-validation 已指定，跳过业务关系校验");
  } else {
    // 期望行数：源数据 - orphan
    const expectedCounts = {};
    for (const [name, s] of Object.entries(summary)) {
      expectedCounts[name] = s.inserted + s.skipped; // DB 里至少这么多个（含之前迁移的）
    }
    console.log("\n[validation] 跑业务关系校验（A-F 共 6 类）...");
    const t0 = Date.now();
    const v = await validateBusinessRules(conn, expectedCounts);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    validationErrors = v.errors;
    validationWarnings = v.warnings;
    console.log(`[validation] ${v.checks.length} checks, errors=${v.errors} warnings=${v.warnings} (${dt}s)\n`);
    for (const c of v.checks) {
      const mark = c.level === "ok" ? "✓" : c.level === "warning" ? "⚠" : "✗";
      console.log(`  ${mark} [${c.level.padEnd(7)}] ${c.msg}`);
    }
  }

  // ─── post_metrics_history.leads_count 回填 ─────────────
  if (args.dryRun) {
    console.log("\n[backfill] dry-run 模式跳过回填");
  } else if (args.skipBackfill) {
    console.log("\n[backfill] --skip-backfill 已指定，跳过 post_metrics_history.leads_count 回填");
  } else {
    console.log("\n[backfill] 回填 post_metrics_history.leads_count ...");
    const t0 = Date.now();
    const r = await backfillLeadsCount(conn);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[backfill] reset=${r.rowsReset} 行;updated=${r.rowsUpdated} 行(${dt}s)`);
    console.log(`           校验:总行=${r.total}  leads_count>0=${r.withLeads}  leads_count 合计=${r.sumLeads}`);
    if (r.sumLeads === 0) console.log(`[backfill] ⚠ 合计为 0,可能是 leads.post_id 没匹配上(检查 orphan 与 FK 校验)`);
  }

  await conn.end();

  console.log("\n=== 不在本次迁移范围 ===");
  console.log("  - notifications   新 schema 是 per-receiver 一行一条，旧是 audience-based 一条群发，结构不兼容，skip");
  console.log("  - daily-snapshots.json   新架构按需重算 dashboard 指标，无对应表，skip");

  if (args.dryRun) {
    console.log("\n[提示] 当前是 --dry-run，没有实际写库/拷贝。去掉 --dry-run 再跑一次。");
  } else if (totalInserted > 0 || (args.skipUploads === false)) {
    console.log("\n=== 下一步 ===");
    console.log("  数据 + uploads 已落位。下一步生成封面缩略图：");
    console.log("    node scripts/backfill-post-cover-thumbs.js --write");
    console.log("  缩略图脚本会读 posts.cover_image_url，用 ffmpeg 缩放后写回 posts.cover_thumb_url；leads 没有缩略图列，跳过。");
  }

  if (validationWarnings > 0) {
    console.log(`\n[提示] 校验有 ${validationWarnings} 个 warning，建议人工复核。`);
  }

  // 退出码：失败 = preflight error / 迁移 fail / 校验 error
  const exitCode = preflightErrors > 0 || totalFailed > 0 || validationErrors > 0 ? 2 : 0;
  process.exit(exitCode);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
