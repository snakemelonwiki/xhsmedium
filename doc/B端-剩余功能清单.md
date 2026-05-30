# B 端剩余功能清单（V1.0 → 完整交付）

> 版本：2026-05-30 V1.0
> 编制依据：
> - `doc/运营中台四端口.md`（V1.0 最终功能版）—— 交付目标
> - `doc/B端-问题修复方案.md` —— 11 条反馈中 B 端范围内 8 项
> - 当前代码库实际进度（`backend/src/modules/*` + `public/js/*` + migrations M1–M5）
> 适用范围：B 端开发（客资协同 + 订单交付 + 消息中心 + 导出）
> 配套：本文档底部"TODOlist 追踪"小节，与本仓库 TaskList 同步

---

## 一、当前状态盘点（截至本文档生成时）

### 1.1 已完成模块（B 端范围）

| 项 | 模块 | 落地情况 | 说明 |
| --- | --- | --- | --- |
| 1 | 数据库迁移 M1–M5 | ✅ | leads 表扩展 7 字段；lead_drafts/import_tasks/collaboration_tasks/orders/order_follow_records/notifications/exports 全部建好；users.role 加 sales/academic 枚举 |
| 2 | 销售跟进闭环（§4 问题1） | ✅ | `PUT /api/leads/:id/board`（带 intentionLevel / processStatus / nextFollowTime / followNote 原子写流水）+ `GET/POST /api/leads/:id/follow-records` |
| 3 | 客资看板统计回后端（§5 问题3） | ✅ | `GET /api/leads/stats?scope=&period=` 返回 total/filteredTotal/assigned/pending/byStatus/byIntention/byProcess；前端统计卡片改走后端口径 |
| 4 | 客资录入草稿表防闪退（§6 问题4） | ✅ | `GET/PUT/DELETE /api/lead-drafts`，前端 debounce 1s + 进入页面恢复弹窗 |
| 5 | 群消息粘贴解析（§7 问题5）后端 | ✅ | `POST /api/leads/parse` 正则切片 platform/contact/nickname/source/operator/ip/status/remark |
| 6 | 客资批量导入（§8 问题7）后端 | ✅ | `POST /api/leads/import-paste` + `GET /api/leads/import-template.xlsx` + `GET /api/import-tasks` 进度查询；30 天内 contact 重复检测 |
| 7 | 协同任务（§2.6）后端 | ✅ | `POST/GET/PUT(claim/handle/close) /api/collaboration-tasks` + 状态机 pending→handling→handled/closed |
| 8 | 订单交付链路（§10）后端 | ✅ | `POST /api/leads/:id/close-deal`（事务：客资→deal_closed + 建 order）+ orders/follow-records CRUD |

### 1.2 半完成（后端 OK，前端缺）

| 项 | 缺失 | 影响 |
| --- | --- | --- |
| A | 协同任务前端（销售发起 + 运营 inbox）| 协同闭环无入口；销售只能写跟进备注，无法明确发起协同 |
| B | 订单交付前端（教务订单池 + 详情 + 节点跟进）| 成交后教务端看不到 |
| C | 粘贴解析前端入口（textarea + 图片粘贴区 + 预览编辑）| `/api/leads/parse` 接口不被调用 |
| D | 批量导入前端入口（Excel/粘贴模式切换 + 进度条 + 失败行下载）| `/api/leads/import-paste` 接口不被调用 |

### 1.3 完全未实现（V1.0 文档要求但代码里没有）

详见下方 §二、§三、§四。

---

## 二、B 端剩余必交付（按优先级）

### P0 - 阻塞 V1.0 验收

#### 2.1 消息中心重构（运营中台四端口 §8.4 + B 端方案 §11）

**当前状态**：`backend/src/modules/notifications/notifications.service.ts` 用内存数组（`const notifications: NotificationItem[] = []`），从未持久化、从未被任何业务事件触发。

**缺失项**：
- [ ] notifications 表已建好（M3），但 NotificationsService 不写库
- [ ] 没有事件分发：客资分配、协同请求、客户未通过、运营已处理、客户已通过、运营已确认来源、订单创建、订单节点临期、订单异常、批量导入完成 —— 10 类通知 code 全部为空
- [ ] WebSocket 推送：四端口在线弹窗 + Socket.IO 适配（V1.0 §10.1 必须）
- [ ] 红点：`unreadCount` 当前是内存计算，需切到 DB
- [ ] 跨端口过滤：`port_type=operations/sales/academic/supervisor/owner` 字段已建但未使用

**接口要求**：
- `GET /api/notifications?status=unread|all&type=&limit=&offset=` — 当前用户的通知
- `PATCH /api/notifications/:id/read` — 标记单条已读
- `POST /api/notifications/read-all` — 全部已读
- WebSocket 事件名（§10.1）：`lead.assigned / collaboration.requested / lead.customer_not_passed / collaboration.handled / lead.added_success / order.created / order.updated / notification.created`

**前端**：
- 顶部消息中心面板已经渲染（`renderNotificationPanel()`），但数据源是 mock，需切到真实 API
- 在线 WebSocket 连接 + 收到事件后增量更新 `state.notifications`

#### 2.2 被动添加客资识别（§4 问题2）

**当前状态**：M1 迁移加了 `leads.source_unknown` 和 `leads.matched_post_id` 字段，但没有任何接口/UI 利用它们。

**接口**：
- [ ] `GET /api/leads/passive/candidates?phone=&wechat=&nickname=` — 加权模糊匹配（phone=50 / wechat=50 / nickname=20 / 7天内时间窗=15 / 来源运营=10）
- [ ] `POST /api/leads/passive/bind` — 选定候选 → 绑定 add_method=passive
- [ ] `POST /api/leads/passive/new` — 匹配不到 → 新建被动客资（source_unknown=1）
- [ ] `POST /api/leads/:id/source-confirm` — 运营在客资看板确认来源（matched_post_id + source_operator_id）

**前端**：
- [ ] 销售端新增菜单"待确认被动添加"
- [ ] 候选列表卡片（含 lead_code 显示，§4.1 已部分实现）
- [ ] 运营端"待运营确认来源"列表（在客资看板加 tab 或 sidebar 入口）

#### 2.3 协同任务前端

**接口已就绪**（见 §1.1 第 7 项）。

**前端**：
- [ ] 销售端在客资详情页加"申请运营协同"按钮 → 弹窗选 type（remind_customer / supplement_info / verify_identity / second_touch）+ reason → POST /api/collaboration-tasks
- [ ] 运营端在客资看板顶部加"协同收件箱"（红点 + 数字），点开看 status=pending 的列表 → 领取（claim）→ 处理（handle 填 handledNote）→ 完成
- [ ] 主管端可看全量协同列表（含超时统计）
- [ ] 状态变化触发通知（依赖 §2.1 消息中心）

#### 2.4 订单交付前端 + 教务端口

**接口已就绪**（见 §1.1 第 8 项）。

**前端**：
- [ ] 销售端"标记成交"按钮（在客资详情）→ 弹窗填 serviceType / amount / remark → POST /api/leads/:id/close-deal
- [ ] **新建教务端**（role=academic）顶部导航：订单池 / 订单详情 / 异常反馈 / 导出
- [ ] 订单池：按状态 tab（待接收/进行中/待客户资料/待老师安排/待交付/已完成/异常）+ 列表卡片
- [ ] 订单详情：客户基础信息 + 服务信息 + 节点跟进时间线 + "新增节点"按钮（POST /follow-records）
- [ ] 异常反馈表单（nodeType='异常'）→ 通知销售 + 主管（依赖 §2.1）
- [ ] 节点提醒（next_remind_at 到期）→ 后端定时任务扫表 + 写 notifications（依赖 §2.1）

### P1 - V1.0 完整体验

#### 2.5 粘贴解析前端入口

**接口已就绪**（`POST /api/leads/parse`）。

**前端**：
- [ ] 客资录入页加"粘贴模式" tab 切换（默认表单 / 粘贴解析）
- [ ] 大 textarea + 图片粘贴区（Ctrl+V 监听）→ 调 /api/leads/parse → 解析结果填进表单的"预览编辑"区
- [ ] 命中失败的字段保留底色提示（hits.<field>='unknown'）
- [ ] 提交按钮 POST /api/leads 带 source='parsed' 审计标记

#### 2.6 批量导入前端入口

**接口已就绪**。

**前端**：
- [ ] 客资录入页加"批量导入"入口（按钮 / 菜单项）
- [ ] 模态框：粘贴模式 textarea / Excel 上传（先放禁用，告知用 CSV）
- [ ] 下载模板按钮 → GET /api/leads/import-template.xlsx
- [ ] 提交后显示进度条 + 失败行表格
- [ ] 主管端"导入历史"列表：GET /api/import-tasks?type=leads

#### 2.7 客资录入图片解耦（§6.4 问题11）

**当前状态**：草稿表已经把 image_urls 解耦到 JSON 字段；但前端组件层是否做到"图片操作不清空文本字段"未验证。

**前端**：
- [ ] 抽取独立的图片上传组件，与文本表单 state 解耦（参考 `state.leadCaptureFile` + ObjectURL 实现）
- [ ] 失败时只 toast 图片错误，不动文本字段
- [ ] 选/换/删图片后，已填的昵称/手机号/平台/账号字段保持不变（验证回归）
- [ ] 作品录入同样规则（A 端实施，本期不展开）

#### 2.8 客资录入/看板/详情稳定性（§9 问题10）

- [ ] 列表分页：默认 20，最大 200（后端 `GET /api/leads` 增加 limit/offset 参数）
- [ ] 搜索框 300ms debounce
- [ ] 保存按钮 1s 内禁双击（前端 disabled 状态）
- [ ] 组件卸载清 timer + AbortController.abort()
- [ ] Token 失效拦截器：先调一次草稿保存 → 再弹重新登录（依赖 §1.1 第 4 项已实现的草稿）
- [ ] WebSocket 断线指数退避重连（依赖 §2.1）

### P2 - 完整闭环（V1.0 §12 + §14）

#### 2.9 导出能力

**当前状态**：`exports` 表已建（M3），`GET /api/leads/export` 仅有一个 legacy TSV 导出。

**接口**：
- [ ] `POST /api/exports` body `{ exportType, filterJson }` → 创建任务（status=pending）→ 异步处理 → 写 file_url
- [ ] `GET /api/exports?type=leads|orders|collaboration_records|posts|rankings` — 当前用户的导出历史
- [ ] `GET /api/exports/:id` — 单条状态
- [ ] `GET /api/exports/:id/download` — 文件下载
- [ ] 5 种导出实现：客资 / 订单 / 协同记录 / 作品（A 端）/ 排行榜（A 端）
- [ ] 敏感字段脱敏：普通员工默认脱手机号/微信号；主管完整导出（§12 + §11.2）

**前端**：
- [ ] 各列表页右上角"导出 Excel"按钮 → 弹窗预览当前筛选条件 → 提交 → 进度条 → 完成通知（依赖 §2.1）
- [ ] 主管端"导出历史"页

#### 2.10 操作日志（V1.0 §九 / operation_logs 表）

**当前状态**：`operation_logs` 表存在（库里已建），无任何代码写入。

**接口**：
- [ ] NestJS 拦截器自动记录关键操作（create/update/delete/login/export/assign）→ INSERT operation_logs
- [ ] `GET /api/operation-logs?targetType=&targetId=&userId=&from=&to=` — 主管查日志

**前端**：
- [ ] 主管端"操作日志"页（暂作为 P2 末位，等其他功能稳定再做）

### P3 - 性能与扩展（V1.0 §十一）

#### 2.11 Redis 缓存 + 预聚合

- [ ] 排行榜结果按"今日/本周/本月/累计"维度预聚合，缓存 5 分钟
- [ ] 客资看板统计卡片缓存 1 分钟
- [ ] 消息未读数缓存到 Redis

#### 2.12 异步队列（BullMQ）

- [ ] 批量导入大文件 → 队列处理
- [ ] Excel 导出 → 队列生成
- [ ] 链接解析（A 端）→ 队列
- [ ] 节点提醒（订单 next_remind_at 到期）→ 队列调度

#### 2.13 对象存储（OSS / MinIO）

- [ ] 客资截图 / 作品封面 / 导出 Excel 文件改走对象存储
- [ ] uploads/ 目录仅作本地兜底

---

## 三、与 V1.0 文档对比（B 端范围）

### 3.1 §6 销售端 vs 已实现

| §6 要求菜单 | 状态 | 备注 |
| --- | --- | --- |
| 我的客资 | ✅ | 后端 `/api/leads?scope=self`，前端跟进看板已展示 |
| 待跟进 | ⚠ 部分 | 前端有"明日待跟进"按钮，但无系统化的"今日必须跟进"自动派单 |
| 客资详情 | ⚠ 部分 | 跟进记录列表已实现，缺：协同记录 tab、来源截图查看、运营备注 |
| 协同申请 | ❌ | 见 §2.3 |
| 订单跟进 | ❌ | 销售端订单 view 缺失 |
| 消息中心 | ⚠ Mock | 见 §2.1 |

### 3.2 §7 教务端 vs 已实现

完全未实现。新增 role=academic（M5 已加 enum），但路由+前端零代码。详见 §2.4。

### 3.3 §5 主管端 vs 已实现

| §5 要求 | 状态 |
| --- | --- |
| 总览 | ⚠ 现有 dashboard，但未含"待处理协同 / 风险提醒" |
| 运营排行榜 | ⚠ rankings 模块存在，是否包含 4 种榜单待测 |
| 个人看板 | ⚠ personal-board.js 存在，"员工选择器"路径未确认 |
| 作品看板 | ⚠ posts-monitor.js 存在 |
| 客资看板 | ✅ |
| 员工/账号管理 | ⚠ 模块存在 |
| 分析看板 | ⚠ analytics.js 存在 |

主管端的剩余项偏向**验证 + 完善**，不在本期 B 端"必交付"范围内（多数与 A 端交叉）。

---

## 四、不在 B 端范围（明确剔除）

- 作品广场 / 学习榜单 / 作品收藏（A 主责，运营中台 §4.5 / §4.3）
- 作品指标手动刷新（A 主责，问题 #8）
- 作品链接解析（A 主责，§4.6）
- 长会话卡顿在作品页（A 主责，问题 #10 作品侧）
- 图片解耦在作品录入（A 主责，问题 #11 作品侧）
- AI 解析（V1.0 §1 明确不含）
- 复杂分析看板（V1.0 §13 明确不做）

---

## 五、复核遗漏（2026-05-30 二次核对）

11 条反馈 + 当前代码逐项核对后，发现 7 处在前面盘点里被遗漏或低估的真实缺口：

| 编号 | 来源 | 缺口 | 严重度 |
| --- | --- | --- | --- |
| L1 | §3.1 销售卡片必显字段 | 当前 SalesFollowupCard 缺 7 项：lead_code（客资编号）、add_method、assigned_at、来源运营 link、添加方式 chip、待添加红点、最新跟进备注摘要 | P0 — 与问题 2 强相关，销售看不到编号就回不了被动添加 |
| L2 | §4.1 / AC-3.2 | 客资看板筛选变化（account/platform/postType/status）只重渲列表，未触发 stats 重拉 | P0 — 直接违反验收基线 |
| L3 | §5.2 stats 接口 | LeadsService.stats() 不接受 account/platform/postType/status/date 过滤维度，前端即使想联动也调不动 | P0 — 与 L2 配套 |
| L4 | §2.2 add_status 枚举 | add_status 仍写中文 "未添加/已添加"，前端 hardcode 比对，未走 enums.js | P1 — 违反 §15 "前后端统一枚举不写中文" |
| L5 | §2.1 客资主状态 status | status 写入路径中英文混存（POST close-deal 写 'deal_closed'，POST /leads 写 '新客资'） | P1 — 同 L4 |
| L6 | §3.4 + 运营中台 §6 | 销售端无独立"客资详情页"，无法看协同记录 / 来源截图 / 运营备注 三段 | P1 — 跟进闭环不完整 |
| L7 | §3.2 next_follow_time 联动 | "明日待跟进"用本地数组 state.salesTomorrowFollowupIds，没读 leads.next_follow_time | P2 — 与已实装的下次跟进字段未打通 |

---

## 六、TODOlist 追踪记录

> 本清单与 Claude Code 的 TaskList 双向同步。任务编号以本文档为准；TaskList 内的 ID 在右侧括号标注。

### 已完成 ✅

- [x] T-01 数据库迁移 M1–M5（leads 扩展 + drafts + imports + 6 张协同/订单/通知/导出/follow 表 + role enum）（#18）
- [x] T-02 销售跟进闭环：意向度 / 处理状态 / 下次跟进 / 时间线（#8）
- [x] T-03 客资看板处理状态展示统一走枚举映射
- [x] T-04 客资看板统计回后端 `GET /api/leads/stats`（#10）
- [x] T-05 客资录入草稿表防闪退（前后端联动）（#11）
- [x] T-06 群消息粘贴解析后端 `POST /api/leads/parse`（#13）
- [x] T-07 客资批量导入后端 `POST /api/leads/import-paste` + 模板 + 进度（#14）
- [x] T-08 协同任务后端 `/api/collaboration-tasks` CRUD + 状态机（#20 后端）
- [x] T-09 订单交付后端 `/close-deal` 事务 + orders/follow-records CRUD（#16 后端）

### 进行中 / 待启动 ⬜

#### P0 阻塞

- [ ] T-10 消息中心持久化重构 + WebSocket 推送 + 10 类通知触发点接入（#17）
- [ ] T-11 被动添加客资识别：候选模糊匹配 + 绑定 + 来源确认（前后端）（#9）
- [ ] T-12 协同任务前端：销售发起 + 运营 inbox + 主管全量视图（#20 前端）
- [ ] T-13 订单交付前端 + 教务端口（role=academic）整套页面（#16 前端）
- [ ] T-L1 销售卡片补齐 §3.1 七项必显字段：lead_code / add_method / assigned_at / 来源运营 link / 添加方式 chip / 待添加红点 / 最新跟进备注摘要
- [ ] T-L2+L3 客资看板筛选与 stats 联动：stats 接口接受 account/platform/postType/status/date 维度 + 前端所有 filter change 都 invalidate leadStats

#### P1 V1.0 完整体验

- [ ] T-14 粘贴解析前端入口：客资录入 tab 切换 + 预览编辑（#13 前端）
- [ ] T-15 批量导入前端入口：粘贴模式 + 模板下载 + 进度 + 失败行下载（#14 前端）
- [ ] T-16 客资录入图片与文本表单解耦验证 + 回归测试（#12）
- [ ] T-17 客资录入/看板/详情稳定性：分页 / debounce / 防双击 / token 失效草稿 / WS 重连（#15）
- [ ] T-L4 add_status 枚举切英文 + 前端走 enums.js（add_status_map）
- [ ] T-L5 客资主状态 status 切英文枚举 + 修复 close-deal 之外的写入路径
- [ ] T-L6 销售客资详情页（独立 view）：协同记录 tab / 来源截图查看 / 运营备注 / 跟进时间线
- [ ] T-L7 "明日待跟进"读 leads.next_follow_time 字段（去掉本地 salesTomorrowFollowupIds 数组）

#### P2 完整闭环

- [ ] T-18 导出能力：5 类导出 + 异步队列 + 敏感脱敏 + 主管/员工权限分级（#19）
- [ ] T-19 操作日志写入：拦截器 + 主管查询接口 + 前端查询页

#### P3 性能与扩展

- [ ] T-20 Redis 缓存 + 排行/看板预聚合
- [ ] T-21 BullMQ 异步队列（导入 / 导出 / 节点提醒调度）
- [ ] T-22 对象存储改造（截图 / 封面 / 导出文件）

### 推进顺序建议

1. **第一批（并行 3 个 agent）**：T-10 / T-11 / T-12 — 消息中心 + 被动添加 + 协同前端，独立度高
2. **第二批（依赖 T-10）**：T-13 — 订单链路前端要触发"教务收到订单"通知，依赖 T-10 完成
3. **第三批（并行 2 个 agent）**：T-14 / T-15 — 录入页面增强，独立模块
4. **第四批（串行）**：T-16 → T-17 — 稳定性回归，依赖 T-14/T-15 完成后做集中验证
5. **第五批（独立 P2）**：T-18 → T-19 — 导出 + 日志，可单 agent 推
6. **P3 留到 V1.1**，本期不动

### 验收基线（V1.0 §14）

完成 T-10 ~ T-18 后即可对照 `doc/运营中台四端口.md` §14 的 12 项验收标准做端到端测试。T-19 ~ T-22 是 V1.1 的内容。

---

## 六、风险与注意事项

1. **消息中心是其他多个任务的依赖**：T-12 / T-13 / T-15 / T-18 都需要触发通知，T-10 必须先落地。
2. **教务端是新端口**：role=academic 已在 M5 加入 enum，但 owner/admin 双端口启动时还没有对应的"教务端口"概念。需要明确：是同 port 3000 用 role 区分（推荐），还是新开 port 3003。
3. **WebSocket 实时推送**：V1.0 §10.1 强制要求，但需要 Socket.IO + 客户端 reconnect 逻辑，工作量不小。可以分阶段：先做 DB 写入 + 长轮询，WebSocket 列为 P1 改造。
4. **数据库索引**：V1.0 §9.1 要求 leads/posts/notifications 等多张表的组合索引，目前 M1–M5 只加了主键索引和部分单列索引，需要补 M6 migration 加组合索引（建议合并到 T-17 稳定性批次）。
5. **状态枚举漂移**：见 `doc/B端-问题修复方案.md` §15。所有新增枚举必须走 `public/js/enums.js` + `backend/src/shared/enums.ts`（后者尚未建立，本期作为 T-10 子任务一并落地）。
