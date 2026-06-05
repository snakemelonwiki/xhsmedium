/**
 * 端到端验证：4 条真实小红书 URL → 抓取 → 写库 → 读回校验
 *
 * 代码路径与 PostsController.fetchMetrics 完全一致：
 *   parser-core.fetchWithRetry  →  metricsFetcher.fetchMetricsFromUrl
 *   → posts.likes / comments / favorites / shares  UPDATE
 *   → post_metrics_history  INSERT
 *
 * 唯一跳过的是 HTTP 路由层（已经 nest build 验证过）。
 *
 * 用法：
 *   node scripts/e2e-verify-fetch-metrics.js
 */

const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "..", "backend", ".env") });

const parserCore = require("./parser-core");

const TEST_URLS = [
  "https://www.xiaohongshu.com/explore/6a1cf4a80000000006037311?xsec_token=ABftDuF0QIxg_QbrL5VMnq_jAk00JwHpn4lFeFO1y4gTE=&xsec_source=pc_feed&source=404",
  "https://www.xiaohongshu.com/explore/6a1833bb00000000070115b9?xsec_token=ABS9SZGFrHHnuHt2g8CAYcT53K0ZTI-476HtlaW0kp230=&xsec_source=pc_feed&source=404",
  "https://www.xiaohongshu.com/explore/6a1afbfd00000000350317d2?xsec_token=ABBi2D4fmx-m4mtzclLIcO23cFB5zn2pd3BVYsPyKd0IY=&xsec_source=pc_feed&source=404",
  "https://www.xiaohongshu.com/explore/6a203416000000003503b700?xsec_token=ABtcgrwxJ_0fHp8UN5TgOAEYV5RWTiBRCeQmmScnqZDuY=&xsec_source=pc_feed&source=404",
];

const EMPLOYEE_ID = "EMP_OPS_C";
const ACCOUNT_ID = "ACC_OPS_C_1";
const POST_TAG = "e2e-verify";

function makeId() {
  return `${POST_TAG}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  console.log("=== 阶段 1: 入库 4 条 0 指标帖子 ===");
  const postIds = [];
  for (let i = 0; i < TEST_URLS.length; i += 1) {
    const id = makeId();
    postIds.push(id);
    await conn.execute(
      `INSERT INTO posts (id, platform, account_id, employee_id, title, post_url, post_type, traffic, likes, comments, favorites, shares, published_at, is_supervisor_picked)
       VALUES (?, '小红书', ?, ?, ?, ?, '素人贴', 0, 0, 0, 0, 0, CURDATE(), 0)`,
      [id, ACCOUNT_ID, EMPLOYEE_ID, `[E2E ${i + 1}] ${path.basename(TEST_URLS[i])}`, TEST_URLS[i]],
    );
    console.log(`  inserted id=${id} url=${TEST_URLS[i].slice(0, 80)}...`);
  }

  console.log("\n=== 阶段 2: 逐条调抓取（走 parser-core.fetchWithRetry）===");
  const results = [];
  for (let i = 0; i < TEST_URLS.length; i += 1) {
    const url = TEST_URLS[i];
    const postId = postIds[i];
    console.log(`\n[${i + 1}/${TEST_URLS.length}] post_id=${postId}`);
    console.log(`  url: ${url.slice(0, 100)}...`);

    const t0 = Date.now();
    const r = await parserCore.fetchWithRetry(url, { retry: 1, timeout: 15000, log: (m) => console.log(`    [scraper] ${m}`) });
    const dt = ((Date.now() - t0) / 1000).toFixed(1);

    if (!r.ok) {
      console.log(`  FAIL  code=${r.error.code} retryable=${r.error.retryable} elapsed=${dt}s`);
      console.log(`        message: ${r.error.message}`);
      results.push({ postId, url, ok: false, error: r.error });
      continue;
    }

    const d = r.data;
    console.log(`  OK  elapsed=${dt}s  platform=${d.platform}  title=${(d.title || "").slice(0, 30)}...`);
    console.log(`      likes=${d.likes}  comments=${d.comments}  favorites=${d.favorites}  shares=${d.shares}`);

    // 写库：UPDATE posts + INSERT post_metrics_history（与 PostsController.fetchMetrics 同步调用一致）
    const updatedAt = new Date(d.metricsUpdatedAt || Date.now());
    await conn.execute(
      `UPDATE posts SET likes=?, comments=?, favorites=?, shares=?, metrics_updated_at=? WHERE id=?`,
      [d.likes, d.comments, d.favorites, d.shares || 0, updatedAt, postId],
    );
    await conn.execute(
      `INSERT INTO post_metrics_history (id, post_id, likes, comments, favorites, shares, leads_count)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [postId, postId, d.likes, d.comments, d.favorites, d.shares || 0],
    );
    console.log(`      wrote to DB (posts + post_metrics_history)`);
    results.push({ postId, url, ok: true, metrics: d, elapsed: dt });
  }

  console.log("\n=== 阶段 3: 读回校验 ===");
  const [rows] = await conn.query(
    `SELECT id, title, post_url, likes, comments, favorites, shares, metrics_updated_at
       FROM posts WHERE id IN (${postIds.map(() => "?").join(",")})`,
    postIds,
  );
  const readback = new Map(rows.map((r) => [r.id, r]));

  let pass = 0;
  let fail = 0;
  for (const r of results) {
    const db = readback.get(r.postId);
    if (!r.ok) {
      console.log(`  ✗ postId=${r.postId}  SCRAPE FAILED [${r.error.code}]`);
      fail += 1;
      continue;
    }
    const ok =
      db.likes === Number(r.metrics.likes) &&
      db.comments === Number(r.metrics.comments) &&
      db.favorites === Number(r.metrics.favorites) &&
      db.shares === Number(r.metrics.shares || 0) &&
      db.metrics_updated_at !== null;
    if (ok) {
      console.log(`  ✓ postId=${r.postId}  likes=${db.likes}  comments=${db.comments}  favorites=${db.favorites}  shares=${db.shares}`);
      pass += 1;
    } else {
      console.log(`  ✗ postId=${r.postId}  DB MISMATCH`);
      console.log(`     db:        ${JSON.stringify(db)}`);
      console.log(`     expected:  ${JSON.stringify({ ...r.metrics, metrics_updated_at: "<set>" })}`);
      fail += 1;
    }
  }

  // 验证 post_metrics_history 也写了
  const [histRows] = await conn.query(
    `SELECT post_id, likes, comments, favorites, shares
       FROM post_metrics_history WHERE post_id IN (${postIds.map(() => "?").join(",")})`,
    postIds,
  );
  const histCount = histRows.length;
  console.log(`\n=== 阶段 4: post_metrics_history 写入校验 ===`);
  console.log(`  history rows: ${histCount} / 期望 ${results.filter((r) => r.ok).length} 条`);
  const histOk = histCount === results.filter((r) => r.ok).length;
  if (histOk) console.log(`  ✓ 历史表已同步`); else { console.log(`  ✗ 历史表行数不对`); fail += 1; }

  console.log(`\n=== 总结 ===  PASS=${pass}  FAIL=${fail}`);
  console.log(`(4 条帖子已留在数据库,可手动清理或复用: ${postIds.join(", ")})`);

  await conn.end();
  process.exit(fail > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
