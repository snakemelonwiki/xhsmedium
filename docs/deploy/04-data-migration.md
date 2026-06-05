# 步骤 4:数据迁移(legacy → 新库)

> 把旧版本(Express + `data.json`)的运营数据一次性灌进新版本(NestJS + MySQL)。

## 30 秒摘要

```bash
cd /var/www/lan-system
sudo LEGACY_DATA_DIR=/path/to/old-lan-system \
     bash docs/deploy/scripts/migrate-legacy-data.sh
```

`migrate-legacy-data.sh` 自动完成 3 步:
1. 调 `scripts/migrate-from-legacy.js` 写库(5 张表 + uploads 拷贝 + 业务校验 + leads_count 回填)
2. 调 `scripts/backfill-post-cover-thumbs.js --write` 生成封面缩略图(用 ffmpeg)
3. `pm2 reload` 让 NestJS 重读数据

## 必要条件

| 项 | 来源 |
|----|------|
| `backend/.env` 存在且填好 | 步骤 2 |
| 老项目 `data.json` 存在 | 你 rsync 上来 |
| 老项目 `uploads/` 目录存在(有图) | 你 rsync 上来 |
| ffmpeg 装好 | 脚本会 apt 装 |
| Playwright Chromium 已装(可跑抓取) | 步骤 3 已装 |

## 跑完后 5 张表的行数预估

| 表 | 旧 data.json | 新库 ≥ |
|----|--------------|--------|
| employees | 8 | 8 |
| users | 11 | 11 |
| accounts | 178 | 178 |
| posts | 472 | 472 |
| leads | 109(2 条 orphan 跳过) | 107 |

新库可能因为已经存在数据(测试 / seed) > 旧库,**这是正常**。脚本会标"DB=N ≥ 源数据 M"。

## 验证 4 条 SQL

```sql
SELECT
  (SELECT COUNT(*) FROM employees)    AS employees,
  (SELECT COUNT(*) FROM users)        AS users,
  (SELECT COUNT(*) FROM accounts)     AS accounts,
  (SELECT COUNT(*) FROM posts)        AS posts,
  (SELECT COUNT(*) FROM leads)        AS leads,
  (SELECT COUNT(*) FROM posts WHERE cover_thumb_url IS NOT NULL) AS posts_with_thumb,
  (SELECT COUNT(*) FROM post_metrics_history WHERE leads_count > 0) AS posts_with_leads;
```

期望:
- `posts_with_thumb` ≥ 你迁的 posts 数(每条 post 都应有 thumb,除非 cover_image_url 缺失)
- `posts_with_leads` > 0(若有 lead 关联 post)

## 单独跑某一步(进阶)

```bash
# 只看迁移会做什么(不真写)
node scripts/migrate-from-legacy.js --source=/path/old --dry-run

# 只回填 leads_count(不重写数据)
node scripts/migrate-from-legacy.js --skip-uploads --skip-validation
# 仍会跑 backfill
```

## 常见问题

| 现象 | 排查 |
|------|------|
| `Bind parameters must not contain undefined` | 旧 lead 缺 `accountId` 字段(2 条),脚本会自动标 orphan |
| `ENOENT: no such file or directory 'uploads/post-covers'` | `backfill` 脚本会自己 mkdir,通常不是问题 |
| `ffmpeg: command not found` | 脚本里会 apt 装,如果你禁用 sudo,手动 `apt install -y ffmpeg` |
| 缩略图 0 个 | 全部 post 都缺 `cover_image_url`(可能是后端没抓成功) |

## 范围外(本次不会迁)

| 数据 | 原因 | 后续 |
|------|------|------|
| `notifications` 旧 28 条 | 新 schema 是 per-receiver,旧是 audience-based | 另写脚本扩 audienceRoles → 多行 |
| `daily-snapshots.json` | 新架构按需重算 dashboard | 无需迁,新系统会重建 |
| 跟进记录 / 协同任务 / 订单 | 旧 data.json 没这些数据 | 新系统业务跑起来自然产生 |

## 下一步

[步骤 5:Nginx + HTTPS](05-nginx-https.md)
