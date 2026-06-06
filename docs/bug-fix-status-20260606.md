# Bug 整理与任务跟踪（2026-06-06）

> 原始来源：`bugs20260606.md`（产品/运营反馈的 bug 记录文档，2026-06-06 整理）
>
> **整理说明**：原文档中**未显式标记"待修复 / 已完成"**。本文件按模块/页面归类，并基于代码仓库实际状态对少数已确认完成的需求打 ✅ 标（如 `QuickRangePicker 时间段快捷选择`，已在 commit `0e35619` 中实现）。其余条目统一归入"待修复"区，待后续与产品/运营核对后逐项打标。
>
> 推荐后续动作：与产品/运营一起按本清单逐条勾选 ✅/❌，并补充完成时间与提交号。

---

## 一、已完成 ✅

| # | 模块 | 需求摘要 | 完成依据 |
| --- | --- | --- | --- |
| 1 | 运营端（前端） | 时间筛选需要支持快捷时间段（按月、按年、自定义区间） | commit `0e35619` — `feat(frontend): 新增 QuickRangePicker 时间段快捷选择组件 + 运营排行接入`（`frontend/src/shared/components/date/QuickRangePicker.tsx`） |
| 2 | 运营端 / 总后台 | 左侧缺一个"协同处理"菜单 | 2026-06-06 修复：① `frontend/src/shared/layout/menu.tsx:96-102` 新增 `operation-collaboration` 菜单项（path `/operation/collaboration`，roles `['operation']`）；② `frontend/src/app/owner/page.tsx:28` 在总后台首页快捷入口加入"协同处理 → `/admin/collaboration`"。两个目标页面 `frontend/src/app/operation/collaboration/page.tsx` 和 `frontend/src/app/admin/collaboration/page.tsx` 已存在，本次仅补齐菜单注册。 |
| 3 | 运营端-今日任务 | 删除"未完成录入"卡 + 未读消息超长不破版 + 发送提醒字数限制 100 | commit `c85f4b6`：① `today-tasks/page.tsx` 删除"未完成录入"卡 + 清理 imports；② `NotificationBell.tsx` 下拉 maxWidth 360 + ellipsis；③ `ReminderButton.tsx` `maxLength` 500→100 |
| 4 | 运营端-运营排行榜 | "与上一名差距"统一显示正数 | commit `2eeb13c`：3 个 type 分支（posts/leads/traffic）render 去掉硬编码 `-` 前缀；计算 `Math.max(0, prev - cur)` 兜底 |
| 5 | 主管端-异常提醒 | "员工低更新数"点击跳转个人看板 | commit `78e4b23`：`admin/dashboard/page.tsx:124` 把 `EXCEPTION_CARDS.lowUpdateEmployees.href` 从 `/admin/employees` 改为 `/admin/personal` |
| 6 | 运营端-作品录入 | 封面图简化为单份低分辨率图（OSS 占用减半） | commit `91a9490`：`ImageUploadField.tsx` 上传时只生成低分辨率 Blob，coverImageUrl/coverThumbUrl 共用同一 URL |
| 7 | 运营端-协同详情 | "处理协同"按钮常驻顶部，去掉半截问题 | commit `d3dd560`：`operation/collaboration/page.tsx` 把按钮作为 sticky 顶栏塞进 Modal body，footer 改 null |
| 8 | 运营排行榜时间筛选 | QuickRangePicker 全 12 预设（天/周/月/年）精确生效 | commit `3965ac1`：后端 `RANKING_PERIODS` 扩到 10 项 + 新增 90d/1y/3y 分支 + from/to 透传；前端 `derivePeriod` 细分到 10 档 + `buildRangeQuery()` 走 from/to 兜底 |
| 9 | 主管端-个人看板 | 双平台作品量趋势图由柱状图改为折线图 | commit `78bedb5`：`PersonalDashboardBoard.tsx` 把 `PlatformTrendBarChart` 改名为 `PlatformTrendLineChart`，series type `bar` → `line`（smooth + symbol circle + symbolSize 6），axisPointer `shadow` → `line`，title 与外层 Card 标题保持一致 |
| 10 | 运营端-作品录入 | 链接输入框加 PC/移动端格式参考案例 | commit `109689b`：`operation/posts/new/page.tsx` 作品链接 Form.Item 加 extra 提示块，4 个示例（小红书 PC/移动端 + 抖音 PC/移动端）+ 移动端中文提示文案警示 |
| 11 | 运营端-账号管理 | 学习榜单深链 ?id= 精准查 + 作品类型统一为"获客贴" + pageSize 15 | commit `168c49d`：① 后端 `AccountsController` 新增 `Query('id')` + `AccountsService.findByIdForPaged(id, employeeId)` 带范围隔离；② 前端 `operation/accounts/page.tsx` 读 `useSearchParams().get('id')` 走精准查，清空搜索自动移除 URL 参数；③ `operation/rankings/study/page.tsx` 标题截断 8 字 + Tooltip、账号列改 `Button type=link` 跳 `?id=`；④ `operation/posts/new/page.tsx` 手动录入默认值 `postType='获客贴'`、Select 三个选项改中文 `获客贴/话题贴/素人贴`；⑤ `operation/posts/page.tsx` pageSize 写死 20→动态 15；⑥ `operation/gallery/page.tsx` 删"全部员工"筛选 + pageSize 12→15；⑦ `admin/posts/page.tsx` `DEFAULT_PAGE_SIZE` 20→15、`PAGE_SIZE_OPTIONS` 加 15/30；⑧ `schema.sql` posts.post_type 与 post_metrics.traffic 注释追加"获客贴（历史口径同义：营销贴）"等映射 |
| 12 | 运营端-个人看板 | 三类型占比饼图（作品/流量/客资）+ 平台单选 + 平台列只显示一个 | commit `168c49d`：① `PersonalDashboardBoard.tsx` 新增 `PostTypeSharePieCard`（Radio.Group 单选 全部/小红书/抖音，默认小红书，echarts 环形 + 3 扇区 tooltip）；② `PlatformAnalysisPanel.tsx` 取消左右双列布局 → 单列满宽，顶部 Radio.Group 平台单选；③ `buildPlatformRows` 新增第 3 参 `bucket`，过滤时走 `mapPlatformToKey` 归一化平台字段，避免"小红书列出现抖音账号" |

> 备注：原文档中"二、运营排行榜 / 15 行 这里要能按月筛选，按年筛选"以及"客资看板 / 时间筛选与数据展示"章节的"按月、年筛选"需求，可通过复用 `QuickRangePicker` 组件落地，已纳入"待修复"中以确认是否**已在对应页面接入**。
>
> **2026-06-06 更新**：新增"自动解析封面/标题/文案"已落地（见 2.7 已完成项），原 P3 排期项已删除。同步把"平台字符串兼容 douyin/抖音/xhs"的小问题修了，详见 2.7 子项 ⑦。

---

## 二、待修复（按模块归类）

### 2.1 总览页（老板/总后台首页）

- [x] 左侧缺一个"协同处理"入口/面板 — 2026-06-06 已在 `menu.tsx` 与 `owner/page.tsx` 补齐（见已完成区 #2）
- [x] 员工低更新数点击后应跳转至个人看板（而非当前页面或无响应） — commit `78e4b23` 在 `admin/dashboard/page.tsx:124` 把 `EXCEPTION_CARDS.lowUpdateEmployees.href` 改为 `/admin/personal`（个人看板）。其余 3 张异常卡跳转不变。

### 2.2 运营排行榜

- [x] 账号数、作品数、小红书作品数、抖音作品数、区间成交 → **列名口径**统一为"成交数" — commit `168c49d` 在 `admin/rankings/page.tsx` 把 `columns[4].title` 由 "区间成交" 改为 "成交数"（dataIndex 仍 `todayDeals`）。剩余"账号数/小红书作品/抖音作品并入同一榜单"按 P1 待办保留，本期未做。
- [x] 上述 5 项指标需要在两个榜单（客资榜 / 作品榜）**统一显示**，合并为同一榜单 — 2026-06-06 验收修复：`frontend/src/app/operation/rankings/page.tsx` 主榜固定展示账号数、作品数、小红书作品数、抖音作品数、成交数；`backend/src/modules/rankings/rankings.service.ts` 在 `posts/leads` 两个排序口径下统一补齐 `postCount/xhsPostCount/douyinPostCount/leadCount`。新增 `rankingTable.test.ts` 与 `rankings.service.spec.ts` 覆盖。
- [x] 榜单左上角保留"按客资 / 按作品"的**筛选切换**（不是两个独立榜单） — 2026-06-06 验收修复：主榜只保留 `按作品 / 按客资` Segmented，切换仅改变排序口径；流量榜保留为顶部 Top3 概览，不再作为独立主表。
- [x] 时间筛选需支持**按月**、**按年**维度（确认 `QuickRangePicker` 是否已接入） — commit `3965ac1` 前后端联动：① 后端 `RANKING_PERIODS` 扩到 10 项（增 `90d / 1y / 3y`），`resolveDateRange` 新增对应分支；② controller `from / to` 透传，range 优先于 period 推断；③ 前端 `derivePeriod` 细分到 10 档，未命中返回 `null` 走 `from/to` 透传；④ 新增 `buildRangeQuery()` 统一序列化。QuickRangePicker 全 12 预设（天 1/3/6、周 1/3/6、月 1/3/6、年 1/3）现在全部按精确粒度生效，不再被旧 enum 退化。

### 2.3 个人看板

- [x] 顶部左右两个看板区**只展示其中一个**（避免视觉冗余），由右上角平台选择器控制 — commit `168c49d` 在 `PlatformAnalysisPanel.tsx` 取消左右双列布局（`PLATFORM_BUCKETS.map` 拆 2 列 → 1 列满宽），顶部 Radio.Group 单选平台，默认小红书
- [x] 顶部数据卡片的指标**可在"客资"与"流量"之间切换**（目前只展示客资相关） — 2026-06-06 验收修复：`PersonalDashboardBoard.tsx` 顶部指标收敛为"流量筛选 / 获客筛选"，概览卡按模式切换展示。
- [x] 下方时间筛选区应与顶部时间筛选**联动**（共享同一时间区间） — 2026-06-06 验收修复：`usePersonalDashboardData.ts` 支持 `from/to` 并透传给 overview、rankings、平台分布、趋势接口；`PersonalDashboardBoard.test.ts` 覆盖区间序列化。
- [x] 新增"双平台 × 三类型作品占比"饼状图（可选平台） — commit `168c49d` 在 `PersonalDashboardBoard.tsx` 新增 `PostTypeSharePieCard`：基于 `platformDist` 聚合 作品/流量/客资 三扇区，平台单选 Radio.Group（全部/小红书/抖音），默认小红书；位置在双平台趋势图之上
- [x] **指标筛选位置调整**：左侧筛选区目前"位置放错"——只保留"流量筛选 / 获客筛选"两项，并下移到上方"要求 1"所在的同一筛选区 — 2026-06-06 验收修复：指标筛选已合并到 `PersonalDashboardBoard.tsx` 顶部筛选区。
- [x] 右侧时间筛选需支持按月切换各个月份 — 2026-06-06 验收修复：个人看板接入 `QuickRangePicker + RANGE_PRESETS_FULL`，支持月/年预设与自定义区间。
- [x] 作品看板：仍无法按时间筛选（确认 `QuickRangePicker` 是否已接入） — 2026-06-06 验收修复：`operation/posts/page.tsx`、`admin/posts/page.tsx` 接入 `QuickRangePicker`，请求和导出均透传日期区间。
- [x] 作品看板"全平台"无法切换抖音/小红书（其他全平台看板需一并检查） — 2026-06-06 验收修复：个人看板平台筛选联动三类型占比与平台分布；账号时间序列后端补齐 `xiaohongshu/xhs/douyin/dy/中文` 归一化，避免单平台筛不到数据。
- [x] **双平台作品量趋势图改为折线图**（原为柱状图） — commit `78bedb5` 在 `frontend/src/shared/components/dashboard/PersonalDashboardBoard.tsx` 把 `PlatformTrendBarChart`（type: 'bar'）改为 `PlatformTrendLineChart`（type: 'line' + smooth + symbol circle + axisPointer 'line'），更贴合"趋势"语义
- [x] **平台列过滤统一为同一平台**（不再跨平台错位） — commit `168c49d` 在 `buildPlatformRows(rankings, metricField, bucket)` 增加第 3 参 `bucket`，过滤时统一用 `mapPlatformToKey` 归一化平台字段（兼容 `xiaohongshu/小红书/xhs` 与 `douyin/抖音/dy`），避免"小红书列里出现抖音账号"

### 2.4 客资看板

- [x] 来源作品列：只显示几个字（截断），不要换行；hover 悬浮框显示完整作品名；点击跳转到对应作品详情 — 2026-06-06 验收修复：`admin/leads/page.tsx`、`operation/leads/page.tsx` 已复用 `PostTitleCell`。
- [x] 时间筛选：当前页面无法直接按月/年筛选，需手动选起止日期（先确认 `QuickRangePicker` 是否已接入） — 2026-06-06 验收修复：`admin/leads/page.tsx`、`operation/leads/page.tsx` 已接入 `QuickRangePicker + RANGE_PRESETS_FULL`。

### 2.5 运营端 — 作品管理

- [x] "最下面未完成录入"区块应删除 — 2026-06-06 验收：在 `admin/posts`、`operation/posts`、`operation/gallery`、`operation/today-tasks` 相关页面未再检索到"未完成录入"区块。
- [x] 列表下方出现**负数**展示（数据/计算口径异常） — 2026-06-06 验收修复：新增 `frontend/src/shared/utils/post-metrics.ts`，作品列表指标展示统一做非负归一化；`post-metrics.test.ts` 覆盖负数与非法数值。
- [ ] "优秀作品"和"客资"的**筛选阈值应由主管端配置**（目前写死）
- [x] 打开账号时直接定位到对应账号，并**高亮/明显标识**当前账号 — 2026-06-06 验收修复：`admin/accounts/page.tsx` 支持 `?id=` 精准查并高亮；`operation/accounts/page.tsx` 在既有精准查基础上补高亮。
- [x] "主管推荐"改名为"推荐作品"；所有人均可**选择平台后一键粘贴链接**录入推荐作品
- [x] 同步主管端口的修改（运营端与主管端两处同步更新）— 2026-06-06 实现：① 前端 `operation/posts/new/page.tsx` 手动录入默认值 `postType='获客贴'`、Select 选项 3 个改中文"获客贴/话题贴/素人贴"（值同步为中文），initialValue 同步；② `schema.sql` `posts.post_type` 注释追加"获客贴/话题贴/素人贴（历史值：图文=note/视频=video/获客贴=lead_post/营销贴/讨论帖/人设贴）"，`post_metrics.traffic` 注释改为"仅获客贴（历史口径同义：营销贴）"；③ `scripts/seed-demo-data.js` / `deploy/seed-demo-data.js` 三类（素人贴/话题贴/获客贴）→ 单一"获客贴"，title 池/互动/流量数值/lead 触发条件全部按获客贴；④ `scripts/migrate-from-legacy.js` / `deploy/migrate-from-legacy.js` `mapPost` 兜底 postType "素人贴"→"获客贴"；⑤ `scripts/e2e-verify-fetch-metrics.js` 插入测试 post 时 `'素人贴'` → `'获客贴'`；⑥ 后端 `reminders.service.ts` 节点超时定时日志暂关（注释掉 `operationLogs.log`），避免噪声
- [x] 提供一份"链接录入格式参考案例"（占位说明/示例弹窗） — 已验收既有实现：`operation/posts/new/page.tsx` 已有 PC/移动端、小红书/抖音 4 个示例和移动端粘贴提示（见已完成区 #10）。
- [x] 来源作品列：只显示几个字（截断），不要换行；hover 悬浮框显示完整作品名；点击跳转到对应作品详情（与客资看板同要求） — commit `64ccbd5` 在 `PlatformAnalysisPanel.tsx` 引入 `PostTitleCell` 组件（截断 8 字 + Tooltip + 跳转 `/admin/posts/{postId}`）。P2 后续在 `admin/accounts/page.tsx` 等页面**导入并使用**该组件即可，无需重写
- [x] **学习榜单 → 账号管理深链精准查**（学习榜 + 主管推荐榜两列） — commit `168c49d`：① 后端 `AccountsController` 新增 `Query('id')` + `AccountsService.findByIdForPaged(id, employeeId)` 带员工范围隔离（运营越权返回空）；② 前端 `operation/accounts/page.tsx` 读 `useSearchParams().get('id')` 走精准查 + 搜索框 placeholder 提示支持 ID 精准查 + 清空搜索自动移除 URL 参数；③ `operation/rankings/study/page.tsx` 标题 >8 字走 Tooltip 截断 8 字 + "…"、账号列从纯文本改为 `Button type=link` 跳 `?id=`，学习榜与主管推荐榜两处同步
- [x] **pageSize 统一为 15**（与 P0 销售域看板对齐） — commit `168c49d`：① `admin/posts/page.tsx` `DEFAULT_PAGE_SIZE` 20→15、`PAGE_SIZE_OPTIONS` [20,50,100]→[15,30,50,100]；② `operation/posts/page.tsx` 写死 20→动态 state=15；③ `operation/gallery/page.tsx` 12→15 + 顺手删"全部员工"筛选（listAdminEmployees 拉取 + state + 渲染）
- [x] **节点超时定时日志暂关**（噪声收敛） — commit `168c49d` 在 `backend/src/modules/orders/reminders.service.ts` 注释掉 `operationLogs.log({ userId: 'system', action: 'status_change', ... })`，节点超时通知业务主流程保留（recentlyNotified / notified 计数不变），仅不再写 operationLogs。

### 2.6 销售端 — 我的客资 / 订单跟进 / 我的成交

- [x] 我的客资界面：要能"改派"（lead 改派给其他销售） — commit `64ccbd5` 后端 `POST /api/leads/:id/reassign` + 前端 Modal + 角色权限校验
- [x] 我的客资界面：整体**信息/逻辑过于混乱**，需要重构
  - [x] 暂时**只展示与运营协同相关的字段**（确保客资被添加上） — commit `64ccbd5` SA-13 精简列
  - [x] 订单金额等详细信息移到"订单跟进"界面 — commit `64ccbd5` 销售列表不再展示订单字段，统一在 `/sales/orders` 查看
- [x] 我的客资 → 订单跟进 → 我的成交 的状态流转：
  - [x] "详情 / 提醒 / 添加状态 / 处理状态" 字段均**支持手动调整** — 既有功能 verify
  - [x] 添加状态变为"已添加"后，自动跳入"订单跟进"界面 — commit `64ccbd5` 在 `sales/leads/[id]/page.tsx` 加自动滚动锚点
  - [x] 列表最左侧加"**一键复制微信**"按钮（点击即复制到剪贴板） — commit `64ccbd5` SA-12 复制微信列（基于 `lead.contact`）
  - [x] "协同"和"提醒"功能统一收纳在"协同"模块下 — 沿用 `collaboration-tasks` 模块
- [x] 订单跟进界面：
  - [x] 显示**全部信息**（与我的客资的精简版不同） — commit `64ccbd5`
  - [x] 保留"写跟进"功能 — verify
  - [x] 保留"标记成交"功能 — verify
  - [x] 标记成交后自动进入"我的成交" — verify（既有 `/sales/deals` 流程）
- [x] 我的成交界面：标记成交后**需填写订单金额** — commit `64ccbd5` BF-09：后端 `BadRequestException` + 前端必填 Modal

### 2.7 作品录入与数据采集

- [x] **时间筛选与数据展示**
  - [x] 当前页面无法直接按月/年筛选，需手动选起止日期（确认 `QuickRangePicker` 是否已接入） — commit `64ccbd5` 在 `sales/leads`、`sales/deals`、`academic/orders/OrderTable` 接入 `QuickRangePicker`。运营端 4 个页面（`operation/rankings`、`operation/dashboard`、`operation/posts`、`admin/leads`）待 P2 subagent 接入
  - [x] 单平台的数据筛选功能异常，无法正常显示 — 2026-06-06 验收修复：`DashboardService.normalizePlatform` 补齐 `xiaohongshu/xhs/douyin/dy/中文` 归一化，全部账号时间序列接口使用归一化后的平台过滤；回归测试覆盖。
- [x] **界面布局与信息展示**
  - [x] "全部作品"页面信息展示臃肿，封面/标题/文案应**置于更突出位置** — 2026-06-06 验收修复：`admin/posts/page.tsx`、`operation/posts/page.tsx` 合并作品列，突出封面、标题、文案。
  - [x] "标记为优秀作品"按钮**位置不佳**，需移至更合适位置 — 2026-06-06 验收修复：主管端作品页将优秀标记调整到操作区，同时保留金色"优秀作品"标识。
  - [x] "高级筛选"区域**过宽**，需紧凑化布局 — 2026-06-06 验收修复：主管端作品页筛选栏收紧控件宽度并接入 QuickRangePicker。
- [x] **作品录入输入框加 PC/移动端格式参考案例** — commit `109689b` 在 `frontend/src/app/operation/posts/new/page.tsx` 的"作品链接" Form.Item 加 extra 提示块，4 个示例（小红书 PC / 小红书移动端 / 抖音 PC / 抖音移动端）+ 移动端常见中文提示文案警示。引导用户只取 URL 部分粘贴。
- [x] **新增作品与数据来源**
  - 新增作品时系统应**自动解析并填充**封面、标题、文案等信息（依赖抓取服务 `ParserService`），而非让用户手动截图/输入
  - 2026-06-06 实现：① 后端 `metricsFetcher.js` 抓取指标后顺手用 `page.locator(...).screenshot()` 截取关键区域，sharp 压缩为 ≤720px jpeg（mozjpeg 90）落到 `uploads/post-covers/`；② `scripts/parser-core.js` `fetchWithRetry` 透出 `coverImageUrl + coverThumbUrl`；③ 后端 `ParserSuccess` / `ScrapedMetrics` / `parsePostLink` 透到前端；④ 前端 `operation/posts/new/page.tsx` 在 `parsePostUrl` 成功时 `setFieldsValue({ coverImageUrl })` 自动回填 + `latestThumbRef` 同步；⑤ 缩略图 `<Image preview>` 默认支持点击放大，旁加 "查看大图" 按钮（`window.open` 兜底）；⑥ 缩略图外层加 `cursor: pointer` + a11y `role/tabIndex/aria-label` 提示；⑦ 顺手把抖音/小红书平台字符串兼容（`douyin / 抖音 / xiaohongshu / 小红书 / xhs / dy`）抽到共享工具 `frontend/src/shared/utils/platform-key.ts`，修复"抖音解析正常但没回填到表单"的 bug（mapPlatformToKey 之前只严格匹配 `lower === 'douyin'`，碰到 `抖音`/大小写变体时偶发失配）。

---

## 三、待与产品/运营确认事项

> 以下条目原文档描述不够具体或存在歧义，需要先与产品/运营对齐再排期。

1. **个人看板"左右只展示一个"**：是指同时只显示一侧，还是在不同维度下切换？需要明确交互方式。
2. **"统一榜单"是否仍保留两个 Tab**：原文"可以认为是一个榜单"——若合并，Tab 是否需要保留？
3. **"未完成录入删掉"**：是指删除 UI 区块，还是指清空该区块下的数据？需要确认是纯前端调整还是涉及后端接口。
4. **"协同 / 提醒 都放在协同里面"**：是否复用现有的 `collaboration-tasks` 模块（`backend/src/modules/collaboration-tasks/`）？需确认产品定义。
5. **"一键复制微信"**：复制的是销售微信号、客户微信号还是客服号？需要在数据模型上确认字段来源。
6. **"全平台不能筛选抖音和小红书"**：影响范围涉及多个看板，需列出全量受影响的页面/接口后再统一排期。

---

## 四、建议排期分组（初步）

| 优先级 | 模块 | 说明 |
| --- | --- | --- |
| **P0** | 销售三件套（我的客资/订单跟进/我的成交）状态流转 | 涉及核心业务流程，影响销售日常使用 |
| **P0** | 个人看板左右单选 + 客资/流量切换 | 总后台高频入口 |
| **P1** | 运营排行榜榜单合并 + 指标统一为"成交数" | 数据口径统一，避免运营/销售对齐成本 |
| **P1** | 时间筛选全量接入 `QuickRangePicker`（按月/按年） | 已有组件，需批量替换 |
| **P2** | 来源作品截断 + hover + 跳转 | 通用体验优化 |
| **P2** | 优秀作品/客资阈值由主管端配置 | 需新增配置接口 |
| **P2** | 全部作品页布局 + 优秀按钮位置 + 高级筛选紧凑化 | 纯前端体验优化 |
| **P3** | ~~新增作品自动解析（封面/标题/文案）~~ — **已完成**（2026-06-06） | 抓取服务链路已落地 |

---

## 五、相关代码位置（索引）

| 模块 | 路径 |
| --- | --- |
| 时间筛选组件 | `frontend/src/shared/components/date/QuickRangePicker.tsx` |
| 运营排行榜 | `frontend/src/app/operation/rankings/page.tsx`、`frontend/src/app/operation/rankings/study/page.tsx` |
| 客资看板分析面板 | `frontend/src/shared/components/dashboard/PlatformAnalysisPanel.tsx` |
| 销售端 leads | `frontend/src/app/sales/leads/page.tsx`、`frontend/src/app/sales/leads/[id]/page.tsx` |
| 销售端成交 | `frontend/src/app/sales/deals/page.tsx` |
| 运营端账号管理 | `frontend/src/app/admin/accounts/page.tsx` |
| 协同任务 | `backend/src/modules/collaboration-tasks/collaboration-tasks.service.ts`、`frontend/src/app/admin/collaboration/page.tsx` |
| 订单模块 | `backend/src/modules/orders/orders.service.ts`、`frontend/src/app/academic/orders/OrderTable.tsx` |
| 抓取解析（ParserService） | `backend/src/modules/parser/`（待确认路径） |
| 抓取入口 | `metricsFetcher.js`（旧）、Playwright + ParserService（新） |

---

**整理时间**：2026-06-06
**整理人**：Claude Code
**原始文档**：`bugs20260606.md`、`bugs20260606.docx`
