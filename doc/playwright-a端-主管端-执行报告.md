# A 端主管端 Playwright 验收执行报告

执行时间：2026-06-02 00:40（Asia/Shanghai）  
执行目录：`D:\workspace\workspace\xsh\xhsmedium\frontend`  
测试文件：`frontend/e2e/a-admin-live.spec.ts`  
baseURL：`http://127.0.0.1:3302`  
账号：`admin2/test123`、`staff1/test123`

## 执行命令与结果

```bash
npx playwright test e2e/a-admin-live.spec.ts --project=chromium --reporter=line --timeout=60000
```

结果：10 条测试，9 passed，1 failed，耗时 26.5s。  
失败 trace：`frontend/test-results/a-admin-live-A-admin-live--01320-n-and-API-denies-admin-data-chromium/trace.zip`  
失败上下文：`frontend/test-results/a-admin-live-A-admin-live--01320-n-and-API-denies-admin-data-chromium/error-context.md`

## 数据写入记录

未新增员工、账号、作品、客资等业务数据；员工/账号新增仅验证必填校验，未提交有效数据。  
按 AD-11 要求真实创建了 posts 导出任务。最近一次完整验收后可见：

- `2780d09a-07f6-4117-b998-fee7352e3cc2`，`exportType=posts`，`status=completed`
- 迭代运行过程中还产生过 posts 导出任务，如 `648e54e5-aa2e-4f14-8420-6e07b1241357`

## 通过用例

| 范围 | 结论 | 证据 |
| --- | --- | --- |
| AD-01/AD-02 主管登录、菜单、总览统计、周期切换、刷新保持登录态 | 通过 | `doc/screenshots/playwright-a-admin-live/01-admin-overview.png` |
| AD-01-003 前端非主管访问 `/admin` | 通过 | `doc/screenshots/playwright-a-admin-live/02-staff-forbidden-admin.png` |
| AD-03 排行榜页面、榜单切换、周期/平台筛选、分页表头 | 通过；页面内无导出按钮，记录为功能缺口 | `03-admin-rankings.png` |
| AD-04 个人看板员工选择器和个人统计卡 | 通过 | `04-admin-personal.png` |
| AD-05 作品看板全局列表、员工/平台/关键词筛选、分页表头 | 通过；详情/建议/导出入口缺失 | `05-admin-posts.png` |
| AD-06 客资看板全局列表、状态标签、刷新 | 通过；改派/提醒/导出入口缺失 | `06-admin-leads.png` |
| AD-07 员工管理列表、搜索、新增必填校验、编辑入口 | 通过；未执行破坏性停用/编辑 | `07-admin-employees.png` |
| AD-08 账号管理列表、搜索、新增必填校验、编辑入口 | 通过；未执行破坏性停用/改派 | `08-admin-accounts.png` |
| AD-09 分析看板基础指标、作品类型分布、员工表现 | 通过 | `09-admin-analytics.png` |
| AD-10 消息中心列表/空状态、未读筛选、刷新、全部已读入口 | 通过 | `10-admin-messages.png` |
| AD-11 导出中心创建 posts 导出任务、列表状态展示 | 通过 | `11-admin-exports.png` |

## 失败用例

| 用例 | 现象 | 风险 |
| --- | --- | --- |
| AD-SEC-002 / AD-01-003 接口层非主管越权 | `staff1` 访问前端 `/admin` 被跳转 `/forbidden`，但同一 staff token 请求 `GET /api/employees` 返回 `200`，预期应为 `401/403` | 后端接口权限边界不足，普通员工可能绕过前端直接读取员工列表 |

复现步骤：

1. 使用 `staff1/test123` 登录获取 token。
2. 请求 `GET http://127.0.0.1:3302/api/employees`，Header 带 `Authorization: Bearer <staff token>`。
3. 实际返回 `200`；Playwright 断言 `[401,403]` 失败。

## 阻塞/未覆盖

- owner 入口：题目说明 `boss01` 密码未知，不强行破解，本轮未覆盖 owner 端口登录。
- 作品详情、主管建议、标记优秀、指标历史：当前 `/admin/posts` 页面未提供对应操作入口，本轮只能记录入口缺失。
- 客资分配/改派/提醒/跟进记录：当前 `/admin/leads` 页面未提供对应操作入口，本轮只能记录入口缺失。
- 排行榜当前页导出：`/admin/rankings` 页面未提供导出按钮；导出中心可单独创建 `rankings` 类型，但未能验证“按当前筛选导出”。
- 订单、协同记录导出：导出中心有类型入口，但本轮按要求至少创建一种真实导出，仅创建 posts。

## 截图目录

`doc/screenshots/playwright-a-admin-live/`

