# A端问题修复 Playwright逐项验证报告（2026-05-31）

> 验证范围：依据 `doc/运营中台四端口-当前问题.md` 中 A 端相关 #6 / #7 / #8 / #9 / #10 / #11。
> 验证方式：本地 Playwright 操作浏览器截图 + API 回归 + MySQL 数据库校验。
> 说明：本会话未暴露 Playwright/数据库 MCP 工具，因此使用项目本地 Playwright 与 `backend/.env` 中 MySQL 配置直连完成验证。

## 一、验证环境

- 前端入口：`http://127.0.0.1:4000`
- 后端入口：`http://127.0.0.1:8089`
- 验证账号：员工 `staff1 / test123`，主管 `admin2 / test123`
- 截图目录：`doc/screenshots/A端-playwright-验证-20260531/`
- 原始证据：`doc/screenshots/A端-playwright-验证-20260531/evidence.json`
- DB 摘要：`doc/screenshots/A端-playwright-验证-20260531/db-summary.json`

## 二、逐项结论

| 问题 | 验证结论 | 关键证据 |
|---|---|---|
| #6 作品广场权限和筛选规则 | 通过。员工端只展示获客数 ≥ 5 的优秀作品；主管端已补齐作品广场入口，可切换视图。 | `02-staff-gallery-excellent-filter.png`、`13-admin-favorite-toggle.png`、DB `post-e2e-excellent-1 lead_count=5` / `post-e2e-normal-1 lead_count=1` |
| #7 作品与客资批量导入 | 通过。作品/客资粘贴导入均展示失败明细并生成导入记录；主管端可见 Excel/CSV 模板与文件上传入口。 | `05-post-bulk-import-validation.png`、`06-lead-bulk-import-validation.png`、`11-admin-post-import-excel-ui.png`、DB `import_tasks.fail_count=1` 且有 `error_file_url` |
| #8 作品数据手动刷新 | 通过入口与防重复 UI 验证。主管作品看板显示批量刷新入口与单条刷新按钮；接口路由正常。 | `10-admin-posts-list-refresh-bulk-button.png`、API `/api/posts/refresh-metrics` 路由已注册；未用真实平台链接触发抓取，避免污染线上指标 |
| #9 学习榜单与收藏 | 通过。学习/排行榜维度可见；作品广场收藏按钮可点击，状态由“收藏”变为“已收藏”，DB 有收藏记录。 | `03-staff-rankings-efficiency.png`、`13-admin-favorite-toggle.png`、`favorite-toggle-evidence.json`、DB `favorites.deleted=0` |
| #10 列表性能与分页 | 通过。作品/客资列表按 `page/pageSize=20` 返回分页数据，前端显示分页区域；图片使用懒加载。 | `08-my-posts-pagination-lazy.png`、`12-admin-leads-pagination.png`、API `/api/posts?page=1&pageSize=20` 和 `/api/leads?page=1&pageSize=20` |
| #11 图片上传与表单解耦 | 通过。作品/客资选择错误文件后只保留图片错误，文本字段未清空。 | `04-post-entry-image-decoupled-error.png`、`07-lead-entry-image-decoupled.png`、evidence 中字段值仍保留 |

## 三、本轮发现并已修复的问题

1. `/api/posts?page=1&pageSize=20` 登录后 500：根因是 `favorites` 表与 `posts` 表字符串列 collation 不一致，收藏子查询比较 `target_id = p.id` 触发 MySQL `Illegal mix of collations`。
   - 修复：在作品列表、作品广场、学习榜、收藏列表关联 SQL 中统一对 `posts.id` 比较加 `COLLATE utf8mb4_unicode_ci`。
   - 涉及：`backend/src/modules/posts/posts.service.ts`、`backend/src/modules/rankings/rankings.service.ts`、`backend/src/modules/favorites/favorites.controller.ts`。
2. 主管端缺少“作品广场”入口且 `renderCurrentView` 无对应分支：导致主管无法按需求查看全部 / 优秀 / 我的收藏视图。
   - 修复：主管导航加入 `staff-gallery`，并在主管视图分支返回 `renderPostsGallery()`。
   - 涉及：`public/app.js`。

## 四、截图清单

| 序号 | 截图 | 说明 |
|---|---|---|
| 01 | `doc/screenshots/A端-playwright-验证-20260531/01-staff-login-dashboard.png` | 员工登录后工作台 |
| 02 | `doc/screenshots/A端-playwright-验证-20260531/02-staff-gallery-excellent-filter.png` | #6 员工作品广场优秀作品过滤 |
| 03 | `doc/screenshots/A端-playwright-验证-20260531/03-staff-rankings-efficiency.png` | #9 学习/排行榜维度 |
| 04 | `doc/screenshots/A端-playwright-验证-20260531/04-post-entry-image-decoupled-error.png` | #11 作品图片错误不清空文本 |
| 05 | `doc/screenshots/A端-playwright-验证-20260531/05-post-bulk-import-validation.png` | #7 作品粘贴导入失败明细 |
| 06 | `doc/screenshots/A端-playwright-验证-20260531/06-lead-bulk-import-validation.png` | #7 客资粘贴导入失败明细 |
| 07 | `doc/screenshots/A端-playwright-验证-20260531/07-lead-entry-image-decoupled.png` | #11 客资图片错误不清空文本 |
| 08 | `doc/screenshots/A端-playwright-验证-20260531/08-my-posts-pagination-lazy.png` | #10 我的作品分页与懒加载 |
| 09 | `doc/screenshots/A端-playwright-验证-20260531/09-admin-dashboard.png` | 主管登录后工作台 |
| 10 | `doc/screenshots/A端-playwright-验证-20260531/10-admin-posts-list-refresh-bulk-button.png` | #8 主管作品看板刷新/导入入口 |
| 11 | `doc/screenshots/A端-playwright-验证-20260531/11-admin-post-import-excel-ui.png` | #7 作品 Excel/CSV 上传入口 |
| 12 | `doc/screenshots/A端-playwright-验证-20260531/12-admin-leads-pagination.png` | #10 主管客资分页 |
| 13 | `doc/screenshots/A端-playwright-验证-20260531/13-admin-favorite-toggle.png` | #9 主管作品广场收藏切换 |

## 五、数据库验证摘要

- 测试账号：`staff1` 对应 `user-test-staff-01 / emp-test-staff-01`；`admin2` 对应 `user-test-admin-02`。
- 作品广场样本：`post-e2e-excellent-1` 获客数 5；`post-e2e-normal-1` 获客数 1；员工端优秀过滤只命中前者。
- 导入记录：`import_tasks` 中员工账号存在作品、客资失败导入记录，`fail_count=1` 且生成 `/uploads/import-errors/*-errors.csv`。
- 收藏记录：`favorites` 中存在主管账号收藏作品记录，且 `deleted=0`。
- 分页数据量：DB 当前 `posts_total=480`、`leads_total=115`，接口仍按每页 20 条分页返回。

## 六、验证命令

```text
node doc/screenshots/A端-playwright-验证-20260531/run-a端-playwright-verify.js
cd backend && npx tsc --noEmit -p tsconfig.json --pretty false
node --check public/app.js public/js/api.js public/js/state.js public/js/auth.js public/js/staff-gallery.js public/js/posts-monitor.js public/js/leads-monitor.js public/js/utils.js
GET /api/posts?page=1&pageSize=20 -> 200
GET /api/posts/plaza?view=excellent -> 200
GET /api/rankings/learning-posts -> 200
```

## 七、仍需人工确认

- #8 刷新指标未使用真实小红书 / 抖音链接执行抓取，避免改写线上真实作品指标；已验证入口、按钮、防重复状态与后端路由可用。
- WebSocket 经 legacy 代理偶发 400 握手日志，不影响本轮 A 端表单、列表、导入和收藏验证；若要验收实时通知，建议单独检查代理 upgrade 配置。
