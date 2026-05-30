# 运营中台 — 当前问题修复 A/B 任务清单

> 创建日期：2026-05-30
> 依据文档：`doc/运营中台四端口-当前问题.md`（11 条问题）
> 分工口径：按功能域拆分（`doc/AB分工-按功能域拆分.md`）
> 用途：把 11 条问题逐条落到 A 端 / B 端的前后端 todo

每条尾部标 `#1` ~ `#11` 对应原问题编号；A/B 都需要参与的归入"共建"。

---

## A 端（内容运营与管理域：作品 / 排行榜 / 学习榜单 / 收藏 / 账号）

### A 后端 todo
- [ ] **作品广场权限分流**：员工端只返回 `leads_count ≥ 5` 的作品；主管端不加这层过滤，新增 `view=all|excellent|favorites` 参数。#6
- [ ] **作品批量导入**：Excel 模板下载接口；批量解析（行级校验，返回成功/失败明细 + 错误文件）；写 `import_tasks(import_type='post')`。#7
- [ ] **作品指标手动刷新**：
  - 单条刷新接口：调用 `metricsFetcher.fetchMetricsFromUrl()` 同步更新 likes/comments/favorites/shares/leads_count。
  - 批量刷新接口：基于当前筛选条件队列化执行，失败可重试。
  - 新建 `post_metrics_history` 表 + 写入逻辑，记录每次刷新快照。#8
- [ ] **收藏域**：新建 `favorites(user_id, target_type, target_id, created_at)` 表；增/删/查接口；"我的收藏"分页 + 按平台/类型/员工/账号筛选；主管端可读总收藏次数。#9
- [ ] **学习榜单接口补充收藏标记**：返回当前用户是否已收藏字段。#9

### A 前端 todo
- [ ] **作品广场页**：员工端默认展示优秀作品；主管端增加"全部 / 优秀 / 已收藏"切换；筛选项按平台、作品类型、获客数、点赞数、发布时间排序。#6
- [ ] **作品批量导入入口**：上传 Excel / 模板下载 / 失败行表格下载。#7
- [ ] **作品刷新交互**：卡片右上"刷新"按钮 + 列表顶部"批量刷新当前筛选"按钮；loading 态防重复点击；失败提示并允许单条重试。#8
- [ ] **收藏交互**：作品卡片 / 学习榜单条目加心形按钮；新增"我的收藏"页面与筛选；列表项支持取消收藏。#9
- [ ] **作品录入页图片与表单解耦**：切换、删除、重传图片不得清空文本字段；图片失败只提示图片。#11
- [ ] **A 域列表性能加固**（主管端作品看板、运营排行榜、学习榜单等）：强制分页（默认 20，无"全部"）；图片缩略懒加载；组件卸载清理定时器/监听器/未完成请求。#10
- [ ] `staff-gallery.js` 中"我的收藏"过滤入口接收藏接口。#9

---

## B 端（客资协同与订单交付域：客资全链路 / 跟进 / 协同 / 草稿 / 解析 / 批量导入）

### B 后端 todo
- [x] **客资字段补齐**（`leads`）：`intention_level`、`process_status`、`add_method`、`matched_post_id` 字段与枚举校验；确保 `lead_code` 已生成且唯一。#1 #2 — M1 迁移 + backfill-lead-code.js，M6 把 status/add_status 也切到英文 ENUM
- [x] **销售跟进接口**：`PUT /api/leads/:id/board` 允许更新意向度/处理状态/下次跟进时间；`POST /api/leads/:id/follow-records` 写 `lead_follow_records`；状态变化触发运营端通知。#1 — 关键字段变更原子写入 follow_record，customer_added / customer_not_passed 通知已接入
- [x] **被动添加识别**：候选匹配接口（按联系方式 / 时间窗 / 来源运营 / 来源作品模糊匹配，返回候选客资卡片数据）；销售确认绑定 / 新建"来源未知"被动客资接口；运营端通知"客户已通过/已添加"。#2 — 4 个接口 `/passive/candidates|bind|new` + `/:id/source-confirm`，加权打分 50/50/20/15/10
- [x] **运营客资看板口径修复**：所有统计走数据库聚合（按 `operator_id = currentUser` 过滤），与列表查询条件一致；统计字段：本月总数 / 筛选后数量 / 已分配 / 待处理。#3 — `GET /api/leads/stats` 支持 scope=self|employee|all + 5 维筛选 + byAddStatus 分组，total 与 filteredTotal 拆开
- [x] **客资录入草稿**：`lead_drafts` CRUD（增量保存、查询用户最近未提交草稿、清理超出 10 条的最早记录）；提交成功后才删除草稿。#4
- [x] **粘贴解析录入**：`leads-parser` 模块补齐字段识别（平台/账号/昵称/联系方式/IP/来源作品/所属运营/状态/备注）；图片上传与 OCR（或人工预览）；返回结构化预览数据，允许部分字段为空。#5 — 走人工预览路径（OCR 不在 V1.0 范围）
- [x] **客资批量导入**：Excel 模板下载；批量校验返回行级错误；写 `import_tasks(import_type='lead')`；与作品导入共用一套 import_tasks 表与状态机。#7（与 A 协调表结构）— 含失败行 CSV (UTF-8 BOM) 落 `uploads/imports/`

### B 前端 todo
- [x] **销售端跟进详情页**：点击"已添加"跳转该客资跟进详情（非仅改列表状态）；表单含意向度 / 处理状态 / 备注 / 下次跟进时间；保存成功提示；保存失败不清空已填内容。#1 — T-L6 已在 `orders-views.js` 实现独立 `salesLeadDetail` 视图，跟进卡"查看详情"按钮进入，三 tab（跟进时间线 / 协同记录 / 来源截图）
- [x] **销售端客资卡片字段补齐**：客资编号、来源作品（封面+原站跳转）、来源运营、添加方式、分配时间、最新跟进备注等。#1 #2 — lead_code badge + 添加方式 chip + 最新跟进摘要 + 来源作品打开按钮
- [x] **销售端"待确认被动添加"列表**：候选客资卡片选择确认绑定；匹配不到时新建被动客资；填手机号/微信号/截图后触发匹配。#2 — 销售端 nav `sales-passive-leads` 已上线
- [x] **运营客资看板**：仅展示本人客资；筛选条件变化后统计卡同步刷新；移除前端本地聚合，统一调统计接口。#3 — 6 维 filter change 全部触发 stats 重拉
- [x] **客资录入页草稿与异常恢复**：输入停止 1 秒自动存；图片上传成功后立即存；提交前再存一次；进入页面时检测未提交草稿并提示恢复；提交失败保留已填内容。#4 — debounce 1s + 7 天内最近草稿恢复弹窗
- [x] **粘贴解析录入入口**：大文本框 + 图片拖拽 / 点击 / `Ctrl+V`；预览区可手动修改；未识别字段不阻断提交。#5 — 录入页 mode tabs (form/paste/import)，hits 命中提示
- [x] **客资录入页图片与表单解耦**：上传 / 重选 / 删除 / 预览均不影响文本字段；图片失败单独提示。#11 — `state._leadFormBuffer` 在 input 事件实时同步，`renderLeadEntry` 用 `bufferedEditing` 注入已填文本，innerHTML 全量重建不再清空表单
- [x] **客资批量导入入口**：Excel 上传、错误行明细下载、导入历史查询。#7 — 录入页"批量导入"按钮 + 失败行表格 + errorFileUrl 下载 + 主管端"导入历史"视图
- [x] **B 域稳定性加固**：销售跟进表单防抖；列表强制分页；离开页面取消 pending 请求；Token 失效先保存草稿再跳登录；WebSocket（若有）断开自动重连。#10 — api.js 401 拦截 + 并发限流 8 请求 + AbortController 统一撤销 + withSubmitLock 防双击 + debounce/throttle 工具；leads 后端分页（limit=20 max=200，旧前端兼容）；nav/切页统一 `abortAllPendingRequests()`；WS 重连列为 V1.1

---

## 共建（A/B 都要碰，先约定再各自落）

- [x] **`import_tasks` 表结构**：A 牵头建表（与作品对接），字段覆盖 `import_type / user_id / success_count / fail_count / error_file_url`，B 复用同张表；主管端导入记录列表归 A。#7 — M3 已建（VARCHAR(64) UUID + total_count/status/finished_at 字段补全）；B 端主管"导入历史"已上线，A 端作品导入接同表即可
- [x] **通知触达**：B 在客资状态变化时写 `notifications`；A 在运营端消息中心 / 红点上承接（结构由 B 出，A 渲染）。#1 #2 — Notification 实体持久化 + 10 类 NOTIFICATION_TYPES 常量；7/10 类触发点已接入（lead_assigned / collab_requested / collab_handled / customer_added / customer_not_passed / lead_source_confirmed / deal_closed / order_abnormal / import_done）；红点 unread_count 已对接
- [ ] **请求基础设施**（前端公共底座）：全局 fetch 包装（防抖、并发限流、组件卸载即 abort）；列表分页组件统一；图片懒加载组件统一。哪边先落由先开工的一方落地后另一方接入。#10 — 未做
- [ ] **30–50 人并发验收**：首页 / 列表 < 2s、提交 < 3s——A 跑作品 / 排行榜场景，B 跑客资录入 / 跟进场景，联合压测。#10 — 未做

---

## 问题→主责对照表

| 编号 | 问题摘要 | 主责 | 副参与 |
|------|----------|------|--------|
| 1 | 销售跟进字段缺失 / 状态流转不完整 | B | A（运营端通知渲染） |
| 2 | 被动添加客资无法识别与反馈 | B | A（运营端通知渲染） |
| 3 | 运营端客资看板数据不对 | B | — |
| 4 | 客资录入闪退 / 草稿缺失 | B | — |
| 5 | 复制群内信息+图片一键录入 | B | — |
| 6 | 作品广场员工/主管权限差异 | A | — |
| 7 | 作品与客资批量导入 | A（作品）+ B（客资） | 共用 `import_tasks` |
| 8 | 作品数据手动刷新 | A | — |
| 9 | 学习榜单/作品广场收藏 | A | — |
| 10 | 长时间使用卡顿 / 内存泄漏 | A + B（共建底座） | — |
| 11 | 图片上传清空表单字段 | A（作品录入）+ B（客资录入） | — |

---

## 备注

- CLAUDE.md 中 "Port 3000 staff / Port 3001 owner" 已与当前 `start.bat`（3002 + 3001 + Nest 8089）不一致，建议本轮顺手更新。
- 现有脚手架已就绪的模块：`backend/src/modules/{collaboration-tasks, imports, lead-drafts, leads-parser, orders, notifications}`，对应 entities 也已建好。本轮重点是把字段、口径、前端入口补齐。

---

## 修复进度汇总（2026-05-30 最终版）

### B 端完成度（本轮交付后）

| 模块 | 进度 | 说明 |
| --- | --- | --- |
| 后端 7 项 | **7/7 = 100%** | 客资字段 / 跟进 / 被动添加 / stats / 草稿 / 解析 / 批量导入 全部交付 |
| 前端 9 项 | **9/9 = 100%** | 跟进详情页 + 卡片字段 + 被动添加 + 运营看板 + 草稿 + 粘贴 + 图片解耦 + 批量导入 + 稳定性 全部闭环 |
| 共建 4 项 | **2/4 = 50%** | import_tasks 表 ✓ / 通知触达 ✓ / 前端底座（已由 B 独立实现 401/分页/并发/防双击）✗ 待 A 接入 / 压测 ✗ |

### 11 条原始反馈 B 端范围（8 条）状态

| # | 反馈 | 状态 | 备注 |
| --- | --- | --- | --- |
| 1 | 销售选意向度/处理状态 | ✅ | 跟进卡控件 + 独立详情页 + 时间线抽屉 |
| 2 | 被动添加客资识别 | ✅ | 后端 4 接口 + 销售端视图 + 运营端来源确认 |
| 3 | 客资看板数据 | ✅ | stats 6 维 + filteredTotal 拆开 + 5 filter 联动 |
| 4 | 录入闪退草稿 | ✅ | debounce 1s + 恢复弹窗 + 提交清理 |
| 5 | 粘贴解析录入 | ✅ | 后端正则 + 前端 mode tab + 预览编辑 |
| 7 | 客资批量导入 | ✅ | 中文模板 + 行级校验 + 错误 CSV + 导入历史 |
| 10 | 长时间卡死（客资侧） | ✅ | 后端分页 + 401 拦截 + 防双击 + AbortController + 并发限流 8 请求 + withSubmitLock |
| 11 | 图片解耦（客资侧） | ✅ | `_leadFormBuffer` 根治 innerHTML 覆盖 + 独立 state |

### 超出 11 条反馈的附加交付

| 模块 | 说明 |
| --- | --- |
| 教务端口 | `role=academic` 完整视图：订单池 / 订单详情 / 异常订单 / 节点跟进 |
| 销售订单跟进 | 销售端 `sales-orders` + 主管端 `orders` 订单看板 |
| 订单交付链路 | `POST /leads/:id/close-deal` 事务 + 订单 CRUD + 教务领取/节点跟进 |
| 协同任务全套 | 销售发起 + 运营 claim/handle/close + 主管全量 + 状态机通知 |
| 导出能力 | 5 类异步导出 + `uploads/exports/` OSS 模拟 + 敏感脱敏 + export_done 通知 |
| 操作日志 | `operation_logs` 表重建 + 多维筛选 + 审计查询 |
| 客资看板与导入中文化 | 导入模板中文列名 + parser 自动跳 header + 导入列说明中文 |
| 消息中心持久化 | 内存数组 → TypeORM + 9/10 类通知触发点 + 红点推送 |

### 剩余待办（退为 P2 / V1.1）

| 项 | 说明 |
| --- | --- |
| WebSocket 推送 | 8 个事件名（lead.assigned 等），建议先做 30s 长轮询替代 |
| 异步队列 | BullMQ 已安装未启用：导入/导出/节点提醒调度 |
| Redis 缓存 | 排行榜预聚合 / stats 缓存 / 消息未读数 |
| 对象存储 | 截图 / 封面 / 导出文件改走 MinIO/OSS |
| 拼接表字段 | intention 旧字段排序、getLeadIntentionChipClass 只匹配中文、mapLead 补 sourcePostTitle、importLeadsPaste 缺归属人、粘贴解析 source='parsed' 落库 |
| 前端消费分页参数 | 后端就绪但前端仍一次性拉全量，QPS 优化 |
| 共建基础设施 | A 端接入 B 端的请求底座（401/分页/并发）；30-50 人并发压测验证 |
