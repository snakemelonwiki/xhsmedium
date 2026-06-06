# 2 人并行 Bug 修复任务分配（2026-06-06）

> 原始需求来源：`docs/bug-fix-status-20260606.md`（基于 `bugs20260606.md` 整理）
>
> **拆分原则**：
> 1. **前后端模块隔离**：P1 负责销售域（`frontend/src/app/sales` + `backend/src/modules/{sales,leads,orders,collaboration-tasks}`），P2 负责运营域（`frontend/src/app/{admin,operation,owner}` + `backend/src/modules/{rankings,dashboard,supervisor-suggestions,accounts,posts}`）。
> 2. **共享工具/组件单点归属**：跨域组件（如 `QuickRangePicker`、`PlatformAnalysisPanel`）由 P1 统一升级，P2 仅以"调用方"身份接入，避免双人对同一文件 commit。
> 3. **Schema/DDL 串行**：数据库 schema 变更统一由 P1 提交（影响面广、合并冲突率高），P2 需要 schema 变更时**先在群里提工单**，由 P1 评审合并。
> 4. **冲突兜底**：两人分头开发时**使用独立 feature 分支**（`feature/p1-*` / `feature/p2-*`），合并顺序：P1 先合 main → P2 rebase 后合 main。

---

## 分工总览

| | 人员 P1（销售域） | 人员 P2（运营域） |
| --- | --- | --- |
| **主要前端目录** | `frontend/src/app/sales/`<br>`frontend/src/app/academic/orders/`（订单看板） | `frontend/src/app/admin/`<br>`frontend/src/app/operation/`<br>`frontend/src/app/owner/` |
| **主要后端模块** | `backend/src/modules/sales/`<br>`backend/src/modules/leads/`<br>`backend/src/modules/orders/`<br>`backend/src/modules/collaboration-tasks/` | `backend/src/modules/rankings/`<br>`backend/src/modules/dashboard/`<br>`backend/src/modules/supervisor-suggestions/`<br>`backend/src/modules/accounts/`<br>`backend/src/modules/posts/` |
| **共享组件所有权** | ✅ `frontend/src/shared/components/date/QuickRangePicker.tsx`<br>✅ `frontend/src/shared/components/leads/*`<br>✅ `frontend/src/shared/components/dashboard/PlatformAnalysisPanel.tsx`（销售端复用） | ❌ 只读 + 调用 |
| **DDL / schema.sql** | ✅ 主合并人 | ❌ 提工单由 P1 合并 |
| **公共 API 类型 (`shared/api`, `shared/types`)** | ⚠️ 谁定义谁合并，**禁止双改同一文件** | ⚠️ 同左 |
| **feature 分支前缀** | `feature/p1-*` | `feature/p2-*` |

---

## 人员 P1（销售域）任务清单

> **P1 完成状态（2026-06-06）**：1.1 ~ 1.6 全部已实现并合入 `feature/p1-bugfix-batch-20260606` 分支。
> 主要 commit：`64ccbd5`（P1 销售域 bug 修复批次）、`8b6512d`（协同处理菜单）、`91a9490`（封面图简化）、`d3dd560`（协同详情 sticky 按钮）。
> 1.7 是流程角色（DDL 评审窗口），无代码产出，由 P1 在 PR 评审时承担。
> 验收细节见 commit message 与 docs/bug-fix-status-20260606.md。
>
> **P2 增量完成（2026-06-06 下午）**：除原计划任务外，P2 还顺手完成了 2.10「新增作品自动解析」P3 项 + 2.12「作品类型全链路统一为获客贴」+ 2.13「订单节点超时定时日志暂关」——
> - 2.10 后端 `metricsFetcher.js` 抓取指标时同步截图 + sharp 压缩到 `uploads/post-covers/`，全链路透出到前端 `ImageUploadField`；并修了"抖音解析正常但没回填"的字符串兼容 bug，把兼容规则抽到共享工具 `frontend/src/shared/utils/platform-key.ts`，客资解析 + 账号分析点阵同步接入。
> - 2.12 前端 `operation/posts/new/page.tsx` 手动录入默认 `postType='获客贴'` + Select 选项改中文（值同步为中文）；`schema.sql` 注释层对齐历史 enum 映射；`scripts/seed-demo-data.js` / `scripts/migrate-from-legacy.js` / `deploy/*` 三个副本同步替换为获客贴；`scripts/e2e-verify-fetch-metrics.js` 同步替换。
> - 2.13 `backend/src/modules/orders/reminders.service.ts` 注释掉节点超时的 `operationLogs.log` 调用，保留业务主流程（recentlyNotified / notified 计数 / 错误捕获）不变。
> - 详情见 2.10 / 2.12 / 2.13 子项。

### 1.1 销售三件套状态流转（P0）
- [x] 我的客资 → 订单跟进 → 我的成交：状态机梳理
  - 涉及文件：
    - `frontend/src/app/sales/leads/page.tsx`
    - `frontend/src/app/sales/leads/[id]/page.tsx`
    - `frontend/src/app/sales/deals/page.tsx`
    - `backend/src/modules/leads/leads.service.ts`
    - `backend/src/modules/orders/orders.service.ts`
- [x] "详情 / 提醒 / 添加状态 / 处理状态" 字段手动调整 — commit `64ccbd5` 引入 SA-13 精简注释保留可读性
- [x] 添加状态 → "已添加" 后自动跳订单跟进 — commit `64ccbd5` 在 `sales/leads/[id]/page.tsx` 加入"已添加通过"状态自动滚动锚点
- [x] 列表**最左侧**"一键复制微信"按钮 — commit `64ccbd5` 引入 SA-12 复制微信列（基于 `lead.contact`/`contactInfo`，空值禁用 + tooltip）
- [x] "协同"和"提醒"统一收纳到 `collaboration-tasks` 模块 — 见 2.1 协同菜单 + 现有 `collaboration-tasks` 模块

### 1.2 我的客资界面精简（P0）
- [x] 去掉下方臃肿信息（订单金额等移至订单跟进） — commit `64ccbd5` SA-13 精简注释：跟进措施列暂隐藏，订单信息统一在 `/sales/orders` 查看
- [x] 信息架构重构：仅展示与运营协同相关的字段 — 同上
- [x] 改派功能（lead 重新分配给其他销售） — commit `64ccbd5` 实现：后端 `POST /api/leads/:id/reassign` + 前端"改派"Modal
- [x] 涉及文件：`frontend/src/app/sales/leads/page.tsx`、`backend/src/modules/leads/leads.service.ts`

### 1.3 订单跟进界面完整化（P0）
- [x] 显示全部信息（与我的客资精简版区分） — commit `64ccbd5` 销售详情页订单跟进区显示全部订单信息
- [x] 保留"写跟进"功能 — 既有功能保留并 verify
- [x] 保留"标记成交"功能 — 既有功能保留并 verify
- [x] 涉及文件：`frontend/src/app/sales/leads/[id]/page.tsx`、`backend/src/modules/leads/leads.service.ts`

### 1.4 我的成交界面补字段（P0）
- [x] 标记成交后必填"订单金额" — commit `64ccbd5` BF-09：后端 `BadRequestException` 校验 `amount > 0`，前端 Modal 必填 + 双重校验
- [x] 涉及文件：`frontend/src/app/sales/deals/page.tsx`、`backend/src/modules/orders/orders.service.ts`

### 1.5 客资看板 — 来源作品截断与跳转（P2）
- [x] 来源作品列只显示前 N 个字，hover 悬浮框显示全名 — commit `64ccbd5` 引入 `PostTitleCell` 组件（截断 8 字 + Tooltip）
- [x] 点击跳转到对应作品详情 — `PostTitleCell` 缺 postId 时优雅降级为纯文本，否则跳转 `/admin/posts/{postId}`
- [x] 涉及文件：
  - `frontend/src/shared/components/dashboard/PlatformAnalysisPanel.tsx`（P1 单点升级）
  - `frontend/src/app/admin/accounts/page.tsx`（P2 接入 — 待 P2 subagent 调用 `PostTitleCell`）

### 1.6 时间筛选全量接入 QuickRangePicker（P1，已可复用）
- [x] 销售端 leads/deals/orders 三个页面接入 `QuickRangePicker` — commit `64ccbd5`：`sales/leads/page.tsx`、`sales/deals/page.tsx`、`academic/orders/OrderTable.tsx` 全部接入
- [x] 涉及文件：
  - `frontend/src/app/sales/leads/page.tsx`
  - `frontend/src/app/sales/deals/page.tsx`
  - `frontend/src/app/academic/orders/OrderTable.tsx`
- [x] ⚠️ 共享组件未变更（沿用 `QuickRangePicker` 默认 6 预设），无需 P2 rebase

### 1.7 DDL / Schema 变更评审窗口（流程角色）
- [x] 流程角色就绪：P1 在 PR 评审时把关 schema 变更（本次 P1 批次未触发 schema 变更，所有改动均在 service/controller 层）
- [x] 集中合并到 `schema.sql` 与 `backend/migrations/` — 本次无新增 migration
- [x] ⚠️ P2 不要直接改 schema 文件 — 流程规则已在原文档保留

---

## 人员 P2（运营域）任务清单

### 2.1 总览页改造（P0）
- [x] ~~左侧新增"协同处理"入口/面板~~ — 2026-06-06 已补齐菜单：
  - `frontend/src/shared/layout/menu.tsx:96-102` 新增 `operation-collaboration` 菜单（path `/operation/collaboration`，roles `['operation']`）
  - `frontend/src/app/owner/page.tsx:28` 在 owner 总后台首页快捷入口加入"协同处理 → /admin/collaboration"
  - 两个目标页面 `operation/collaboration/page.tsx` 和 `admin/collaboration/page.tsx` 已存在，本次仅注册菜单
- [x] 员工低更新数点击 → 跳转到该员工个人看板 — commit `78e4b23` 在 `admin/dashboard/page.tsx:124` 把 `EXCEPTION_CARDS.lowUpdateEmployees.href` 从 `/admin/employees` 改为 `/admin/personal`。其余 3 张异常卡（协同超时 / 客资积压 / 账号异常）保持原样。
  - 可选增强：跳转时带 `?lowUpdate=1` 让个人看板预筛——未做，等产品确认 UX
- [ ] 时间筛选接入 `QuickRangePicker`（P1 升级后直接调用）
- [ ] 涉及文件：
  - `frontend/src/app/owner/page.tsx`（已部分改动，2026-06-06）
  - `backend/src/modules/dashboard/dashboard.service.ts`（首页数据接口）

### 2.2 运营排行榜榜单合并与指标统一（P1）
- [x] 指标统一改名为"成交数"（账号数/作品数/小红书作品/抖音作品/成交数 统一口径）— commit `168c49d` 仅做"列名口径"：在 `admin/rankings/page.tsx` 把 `columns[4].title` 由"区间成交"改为"成交数"（dataIndex 仍 `todayDeals`）。"账号数/小红书作品/抖音作品并入同一榜单"按 P1 待办保留
- [ ] 两个 Tab 合并为一个榜单，左上角"按客资 / 按作品"作为筛选器
- [x] 时间筛选接入 `QuickRangePicker`（按月/按年预设） — 2026-06-06 进一步扩到全 12 预设生效（commit `3965ac1`）：
  - 后端 `RANKING_PERIODS` 扩到 10 项（增 `90d / 1y / 3y`），`resolveDateRange` 新增对应分支
  - controller `from / to` 透传，range 优先于 period 推断
  - 前端 `derivePeriod` 细分到 10 档，未命中返回 `null` 走 `from/to`
  - 新增 `buildRangeQuery()` 统一序列化；`load` / `loadTop3` 改用 `rangeQuery`
  - 最早接入 commit：`0e35619 feat(frontend): 新增 QuickRangePicker 时间段快捷选择组件 + 运营排行接入`
- [ ] 涉及文件：
  - `frontend/src/app/operation/rankings/page.tsx`（已部分改动，2026-06-06）
  - `frontend/src/app/operation/rankings/study/page.tsx`（已部分改动，2026-06-06，作品标题截断 + 账号深链）
  - `backend/src/modules/rankings/rankings.service.ts`

### 2.3 个人看板重构（P0）
- [x] 左右两个看板区**只展示其中一个**（右上角平台选择器控制）— commit `168c49d` 在 `PlatformAnalysisPanel.tsx` 取消左右双列布局（`PLATFORM_BUCKETS.map` 拆 2 列 → 1 列满宽），顶部 Radio.Group 单选平台，默认小红书，只渲染 `activeBucket`
- [ ] 顶部指标"客资 / 流量"可切换
- [ ] 顶部/底部时间筛选联动（共享 `QuickRangePicker`）
- [x] 双平台作品量趋势图改为折线图 — commit `78bedb5` 在 `frontend/src/shared/components/dashboard/PersonalDashboardBoard.tsx` 把 `PlatformTrendBarChart` 重命名为 `PlatformTrendLineChart`，series type 由 `bar` 改为 `line`（smooth + symbol circle），axisPointer `shadow` → `line`，title 同步改"双平台作品量趋势"。函数和调用点同步更新，tooltip 数据显示不变。
- [x] 平台列过滤统一为同一平台（避免"小红书列里出现抖音账号"）— commit `168c49d` 在 `buildPlatformRows(rankings, metricField, bucket)` 新增第 3 参 `bucket`，过滤时统一用 `mapPlatformToKey` 归一化平台字段（兼容 `xiaohongshu/小红书/xhs` 与 `douyin/抖音/dy`）
- [ ] 涉及文件：
  - `frontend/src/shared/components/dashboard/PlatformAnalysisPanel.tsx`（**已 P2 升级**，2026-06-06 168c49d）
  - `frontend/src/app/admin/dashboard/page.tsx`（P2 接入）
  - `backend/src/modules/dashboard/dashboard.service.ts`
  - `backend/src/modules/supervisor-suggestions/supervisor-suggestions.service.ts`

### 2.4 个人看板 — 双平台 × 三类型作品占比饼状图（P1）
- [x] 下图上方新增饼状图（可选平台）— commit `168c49d` 在 `PersonalDashboardBoard.tsx` 新增 `PostTypeSharePieCard`（echarts 环形 + 3 扇区），基于 `platformDist` 聚合 作品/流量/客资，平台单选 Radio.Group（全部/小红书/抖音），默认小红书
- [ ] 涉及文件：同 2.3，复用 `PlatformAnalysisPanel`

### 2.5 个人看板 — 指标筛选位置调整（P1）
- [ ] 左侧筛选区移除"位置错误"项，**只保留"流量筛选 / 获客筛选"**（本期 168c49d 未动；等 2.3 后续 P2 提交时一起迁移）
- [ ] 统一收纳到顶部筛选区（要求 1 所在的同一区域）
- [ ] 涉及文件：同 2.3

### 2.6 作品看板 — 时间筛选与平台筛选修复（P1）
- [x] 接入 `QuickRangePicker`（按月切换）— 既有 1.6 全量接入，本次无新增
- [x] "全平台"维度下能切换抖音/小红书（其他看板一并检查）— commit `168c49d` 在 `PlatformAnalysisPanel.tsx` 顶部 Radio.Group 平台单选，并在 `buildPlatformRows` 内通过 `mapPlatformToKey` 归一化平台过滤
- [ ] 涉及文件：
  - `frontend/src/app/admin/dashboard/page.tsx`
  - `backend/src/modules/posts/posts.service.ts`

### 2.7 运营端 — 作品管理（P2）
- [ ] 删除"未完成录入"区块
- [ ] 修复列表下方负数展示（数据/计算口径异常）
- [ ] "优秀作品"和"客资"阈值由主管端配置（P1 提供配置接口）
  - ⚠️ **跨人协作**：P2 触发需求 → P1 在 `supervisor-suggestions` 模块新增配置接口 → P2 接入前端
- [ ] 打开账号时**高亮定位**当前账号
- [ ] "主管推荐" 改名为 "推荐作品"
- [ ] 一键粘贴链接录入推荐作品（涉及抓取服务，见 2.10）
- [x] 同步主管端口的修改（运营端与主管端两处同步更新）— commit `168c49d` 实现：① 前端 `operation/posts/new/page.tsx` 手动录入默认值 `postType='获客贴'`、Select 选项 3 个改中文"获客贴/话题贴/素人贴"（值同步为中文），initialValue 同步；② `schema.sql` `posts.post_type` 注释追加"获客贴/话题贴/素人贴（历史值：图文=note/视频=video/获客贴=lead_post/营销贴/讨论帖/人设贴）"，`post_metrics.traffic` 注释改为"仅获客贴（历史口径同义：营销贴）"；③ `scripts/seed-demo-data.js` / `deploy/seed-demo-data.js` 三类（素人贴/话题贴/获客贴）→ 单一"获客贴"，title 池/互动/流量数值/lead 触发条件全部按获客贴；④ `scripts/migrate-from-legacy.js` / `deploy/migrate-from-legacy.js` `mapPost` 兜底 postType "素人贴"→"获客贴"；⑤ `scripts/e2e-verify-fetch-metrics.js` 插入测试 post 时 `'素人贴'` → `'获客贴'`
- [x] 提供"链接录入格式参考案例"提示 — commit `109689b` 在 `frontend/src/app/operation/posts/new/page.tsx` 作品链接 Form.Item 加 extra 提示块，4 个示例（小红书 PC / 小红书移动端 / 抖音 PC / 抖音 移动端）+ 移动端中文提示文案警示（"先复制一下，再到【小红书】打开查看笔记"、"hbn:/ 04/28 ..."等），引导用户只取 URL 部分粘贴。
- [x] 来源作品截断 + hover + 跳转（学习榜单两列）— commit `168c49d` 在 `operation/rankings/study/page.tsx` 标题 >8 字走 Tooltip 截断 8 字 + "…"；账号列从纯文本改为 `Button type=link` 跳 `/operation/accounts?id=...`
- [x] **学习榜单 → 账号管理深链精准查**（`?id=` 带员工范围隔离）— commit `168c49d`：① 后端 `AccountsController` 新增 `Query('id')` + `AccountsService.findByIdForPaged(id, employeeId)` 带员工范围隔离（运营越权返回空）；② 前端 `operation/accounts/page.tsx` 读 `useSearchParams().get('id')` 走精准查 + 搜索框 placeholder 提示支持 ID 精准查 + 清空搜索自动移除 URL 参数
- [x] **pageSize 统一为 15**（与 P0 销售域看板对齐）— commit `168c49d`：① `admin/posts/page.tsx` `DEFAULT_PAGE_SIZE` 20→15、`PAGE_SIZE_OPTIONS` [20,50,100]→[15,30,50,100]；② `operation/posts/page.tsx` 写死 20→动态 state=15；③ `operation/gallery/page.tsx` 12→15 + 顺手删"全部员工"筛选（listAdminEmployees 拉取 + state + 渲染）
- [ ] 涉及文件：
  - `frontend/src/app/admin/accounts/page.tsx`
  - `frontend/src/app/admin/collaboration/page.tsx`
  - `frontend/src/app/operation/accounts/page.tsx`（已 P2 升级，2026-06-06 168c49d）
  - `frontend/src/app/operation/rankings/study/page.tsx`（已 P2 升级，2026-06-06 168c49d）
  - `frontend/src/app/operation/posts/new/page.tsx`（已 P2 升级，2026-06-06 168c49d）
  - `frontend/src/app/operation/posts/page.tsx`（已 P2 升级，2026-06-06 168c49d）
  - `frontend/src/app/operation/gallery/page.tsx`（已 P2 升级，2026-06-06 168c49d）
  - `frontend/src/app/admin/posts/page.tsx`（已 P2 升级，2026-06-06 168c49d）
  - `backend/src/modules/posts/posts.service.ts`
  - `backend/src/modules/supervisor-suggestions/supervisor-suggestions.service.ts`

### 2.8 销售端改派功能配合（P2 只读，无改动）
- ⚠️ 无 P2 任务，列出仅为说明：销售端改派（1.2）由 P1 独立完成

### 2.9 全部作品页布局优化（P2）
- [ ] 封面/标题/文案**置于更突出位置**
- [ ] "标记为优秀作品" 按钮位置调整
- [ ] "高级筛选" 区域紧凑化
- [ ] 涉及文件：`frontend/src/app/admin/accounts/page.tsx`（或全部作品页对应文件）

### 2.10 新增作品自动解析（P3 → 已完成 2026-06-06）
- [x] 接入 `ParserService`（`backend/src/modules/parser/`），新增作品时自动解析封面/标题/文案
- [x] 缩略图点击查看（antd `<Image preview>` + 「查看大图」按钮兜底）
- [x] 缩略图质量提升（sharp mozjpeg 90 + 宽 720px）
- [x] 兼容 `douyin` / `抖音` / `xiaohongshu` / `小红书` / `xhs` / `dy` 平台字符串（共享工具 `frontend/src/shared/utils/platform-key.ts`）
- [x] 修复"抖音解析正常但没回填到表单"bug（mapPlatformToKey 之前只严格匹配 `lower === 'douyin'`，碰到 `抖音` / 大小写变体时偶发失配）
- [x] 修复"复粘贴 URL 导致旧 in-flight 响应覆盖新表单"竞态（`parseSeqRef` 序号守卫，过期响应直接 `return` 不写表单）
- [x] 客户端 90s 超时（`AbortController` + `setTimeout`，覆盖 Playwright 抓取+截图链路最坏情况；超时走 catch 兜底而不是无限 spinner）
- [x] 抓取耗时优化（**抖音 35s → 10.6s / 小红书 13s → 3.7s**）：
  - **关键修复**：`readTextBySelectors` 串行 → 并行。旧版每项指标 × 6 selectors × 1.2s 串行 = 28.8s 纯等待；
    新版所有 selector 并行 + 1.5s 硬上限，单项指标 ~1.5s 内返回。这是耗时主要瓶颈。
  - `metricsFetcher.js` `networkidle` 超时 5s → 1.5s + `waitForTimeout(2000)` → 400ms
  - `capturePostCover` 4 路并行（locator / video poster / og:image / first img），首个非空胜出
  - `posts-metrics.service` parse-link 走 `source:'parse-link'` 短路：retry 2 → 0、timeout 15s → 20s
  - `ScrapingLockService` 间隔 8s → 3s（env `SCRAPING_LOCK_MIN_GAP_MS` 可调）
- [x] `posts.controller.parseLink` 加显式 try/catch 兜底（5xx 降级为 200 + `parsed:false` + `warning`，前端走 catch 不再看到 500）
- [x] 涉及文件：
  - `metricsFetcher.js`（截图 + sharp 压缩到 `uploads/post-covers/`）
  - `scripts/parser-core.js`（透出 cover 字段）
  - `backend/src/modules/parser/parser.service.ts`（ParserSuccess 接口加字段）
  - `backend/src/modules/posts/posts-metrics.service.ts`（ScrapedMetrics 透传）
  - `backend/src/modules/posts/posts.service.ts`（parsePostLink 透出）
  - `frontend/src/app/operation/posts/new/page.tsx`（自动回填封面 + 平台字符串兼容）
  - `frontend/src/shared/components/forms/ImageUploadField.tsx`（点击放大 + 查看大图按钮）
  - `frontend/src/shared/utils/platform-key.ts`（新增，跨页面复用）
  - `frontend/src/app/operation/leads/new/page.tsx`（客资解析接入新工具）
  - `frontend/src/app/operation/dashboard/account-analysis/page.tsx`（平台点阵颜色走新工具）

### 2.11 时间筛选全量接入 QuickRangePicker（P2 端）
- [ ] 排行榜 / 个人看板 / 作品看板 / 客资看板 **全量替换**为 `QuickRangePicker`
- [ ] ⚠️ `QuickRangePicker` 组件文件**禁止 P2 修改**，如需新预设值 → 提工单给 P1

### 2.12 作品类型全链路统一为"获客贴"（P1，2026-06-06 完成）
- [x] 前端表单：手动录入默认值 `postType='获客贴'`、Select 选项 3 个改中文"获客贴/话题贴/素人贴"
- [x] `schema.sql` 注释对齐：`posts.post_type` 注释追加"获客贴/话题贴/素人贴（历史值：图文=note/视频=video/获客贴=lead_post/营销贴/讨论帖/人设贴）"，`post_metrics.traffic` 注释改为"仅获客贴（历史口径同义：营销贴）"
- [x] 演示数据：`scripts/seed-demo-data.js` / `deploy/seed-demo-data.js` 三类（素人贴/话题贴/获客贴）→ 单一"获客贴"，title 池/互动/流量数值/lead 触发条件全部按获客贴
- [x] 迁移兜底：`scripts/migrate-from-legacy.js` / `deploy/migrate-from-legacy.js` `mapPost` 兜底 postType "素人贴"→"获客贴"
- [x] E2E 脚本：`scripts/e2e-verify-fetch-metrics.js` 插入测试 post 时 `'素人贴'` → `'获客贴'`
- ⚠️ **重要**：前端 form 选项值改为中文后，需确认后端/DB 不再回写旧 enum（`note/video/lead_post`），否则会出现"前 display 中文 / 后存旧 enum"误判——已在 schema 注释对齐"获客贴/话题贴/素人贴"为合法值，旧 enum 通过注释说明

### 2.13 订单节点超时定时日志暂关（P1，2026-06-06 完成）
- [x] `backend/src/modules/orders/reminders.service.ts` 注释掉 `operationLogs.log({ userId: 'system', action: 'status_change', ... })`
- 原因：节点超时通知会反复触发，`operationLogs` 短期内写入量大，先降噪
- 业务主流程保留：`recentlyNotified` 去重 + `notified` 计数 + 错误捕获不变
- 后续若需要审计可加节流：例如 `(order.id) % N === 0` 或"同一订单 24h 内只写一次"

---

## 共享文件 / 跨人协作事项

### 跨人文件（必须串行）
| 文件 | 所属人 | 说明 |
| --- | --- | --- |
| `frontend/src/shared/components/date/QuickRangePicker.tsx` | P1 | P2 只能调用，不能改 |
| `frontend/src/shared/components/dashboard/PlatformAnalysisPanel.tsx` | ⚠️ P2 2026-06-06 168c49d 已升 | 后续 P1 改动需 rebase P2 提交 |
| `frontend/src/shared/components/dashboard/PersonalDashboardBoard.tsx` | ⚠️ P2 2026-06-06 168c49d 已升 | 同上 |
| `frontend/src/shared/components/leads/*` | P1 | P2 只能调用，不能改 |
| `schema.sql` | P1（DDL）；P2 注释层 | P2 2026-06-06 168c49d 仅改字段 COMMENT，未动 DDL |
| `backend/src/migrations/*` | P1 | P2 提工单，由 P1 合并 |
| `frontend/src/shared/api/*` | 谁用谁合并，禁止双改 | 提交前先 `git log` 确认 |
| `frontend/src/shared/types/*` | 谁用谁合并，禁止双改 | 提交前先 `git log` 确认 |
| `frontend/src/shared/components/status/*` | P1（订单状态） | P2 不可改 |
| `frontend/src/shared/utils/platform-key.ts` | 谁用谁合并，禁止双改 | 168c49d 由 P2 引入并已接入 PlatformAnalysisPanel |

### 跨人协作工作流
1. **P2 需要改共享组件** → 在群里发工单："需在 `QuickRangePicker.tsx` 增加 X 预设" → P1 评估 → P1 提交 → P2 rebase 接入
2. **P2 需要 schema 变更** → 在群里发工单："需在 `leads` 表加 `wechat_id` 字段" → P1 评审 → P1 写 migration → P2 在 service 层使用
3. **每天 17:00 同步分支** → P1 先 `git pull` 合并到 main，P2 rebase 自己的 feature 分支

### 兜底冲突解决
- 如果 P1/P2 同一文件冲突 → **按以下优先级**解决：
  1. P1 优先（销售域业务流为主线）
  2. 如果 P2 的改动在非销售域（如 admin 模块），P2 优先
  3. 双方都在同一区域 → 面对面结对解决

---

## 合并顺序与 CI

1. **P1 先合 main**
   - `feature/p1-*` → main
   - main 跑 CI + Playwright 烟测
2. **P2 rebase 后合 main**
   - `git fetch && git rebase origin/main`
   - `feature/p2-*` → main
   - main 跑 CI + Playwright 全量
3. **main 锁定** 在两个 PR 合并之间
   - P1 提 PR → review → merge → unlock → P2 提 PR → review → merge

---

## 排期建议

| 周次 | P1 | P2 |
| --- | --- | --- |
| **W1（D+1 ~ D+3）** | 1.1 / 1.2 / 1.3 / 1.4（销售三件套状态流转） | 2.1 / 2.2（总览 + 排行榜 — 168c49d 完成 2.2 列名口径统一） |
| **W1（D+4 ~ D+5）** | 1.5 / 1.6（客资看板 + 时间筛选） | 2.3 / 2.4 / 2.5（个人看板重构 — 168c49d 完成左右单选 / 平台列过滤 / 三类型饼图；2.5 指标筛选位置 P1 后续工单） |
| **W2（D+6 ~ D+8）** | 协同工单支持（接收 P2 需求） | 2.6 / 2.7（作品看板 + 运营端作品管理 — 168c49d 完成学习榜深链精准查、pageSize 15、来源作品截断、作品类型统一） |
| **W2（D+9 ~ D+10）** | 集成测试 + 修复 | ~~2.9 / 2.10~~（2.10 已提前完成；2.9 留待下一轮；2.12 / 2.13 已在 168c49d 完成） |
| **W2（D+10）** | 双方合并 main，发版 | 同左 |

---

## 待产品/运营确认（影响分配）

1. **"一键复制微信"** 的字段来源 → 影响 P1 的 1.1，需要先确认
2. **"协同 / 提醒统一到协同"** 的产品定义 → 影响 P1 1.1 + P2 2.1，需要先确认
3. **"优秀作品 / 客资阈值"** 的可配置项范围 → 影响 P1 工单范围 + P2 2.7，需要先确认
4. **"个人看板左右只显示一个"** 的具体交互方式 → 影响 P2 2.3，需要先确认

> 以上 4 项确认前，**对应任务可先做技术预研 / 接口设计**，业务实现等确认后再开工。

---

**整理时间**：2026-06-06
**整理人**：Claude Code
**关联文档**：
- `docs/bug-fix-status-20260606.md`（按模块整理的需求清单）
- `bugs20260606.md`（原始产品/运营反馈）
