# 运营中台 B 端问题修复方案（客资协同与订单交付域）

> 版本：V1.0 最终版
> 创建日期：2026-05-30
> 编制依据：
> - `doc/运营中台四端口.md`（V1.0 最终功能版）
> - `doc/运营中台四端口-当前问题.md`（11 条反馈）
> - `doc/AB分工-按功能域拆分.md`（按功能域的 A/B 分工）
> 适用范围：B 端开发人员（客资协同 + 订单交付 + 消息/导出）
> 配套工作清单：`plan.md`（任务级跟踪）

---

## 一、范围界定与责任分配

### 1.1 11 条反馈对应到 B 端的责任

| # | 反馈摘要 | B 主责 | A 主责 | 备注 |
| --- | --- | --- | --- | --- |
| 1 | 销售端"已添加"后无法选意向度/处理状态 | ✅ | — | 客资跟进闭环重构 |
| 2 | 销售端被动添加客资无法绑定与反馈 | ✅ | — | 客资编号 + 模糊匹配 |
| 3 | 运营端客资看板数据不对 | ✅ | — | 统计口径与权限重构（运营端仅展示自己的客资） |
| 4 | 客资录入闪退后数据全没 | ✅ | — | 客资草稿表 + 图片解耦 |
| 5 | 复制群里报客资+图片即可录入 | ✅ | — | 文本解析 + 图片粘贴 |
| 6 | 作品广场只看获客≥5 的作品 | — | A | A 主责，B 须提供"按 post_id 聚合的客资数"口径（见 §7.1） |
| 7 | 作品/客资批量导入 | ✅（客资） | A（作品） | 共用 import_tasks 表，B 主责 leads 导入；模板与失败行规则 §6 |
| 8 | 作品数据手动刷新 | — | A | 与 B 无关，但 B 须订阅"客资数刷新结果"以同步 leads_count |
| 9 | 学习榜单/作品广场收藏 | — | A | A 主责 |
| 10 | 长时间使用卡死（客资侧） | ✅（客资页） | A（作品页） | 仅承担客资录入/看板/详情的稳定性修复 |
| 11 | 上传图片清空已填字段（客资侧） | ✅（客资） | A（作品） | 客资录入与作品录入分别整改，同一交互规则 |

B 端实际承担问题：**1 / 2 / 3 / 4 / 5 / 7-客资 / 10-客资 / 11-客资**，共 8 项。

### 1.2 与 A 端的接口边界（必须先于编码锁定）

A 输出给 B（B 在销售端/客资看板/订单等位置直接消费）：
- `GET /api/posts/:id`：来源作品基础信息（封面、标题、平台、所属运营、原帖链接、作品类型）。
- `GET /api/users?role=staff`、`GET /api/employees`：员工/运营基础列表。
- `GET /api/accounts`：账号基础列表（客资录入选源账号用）。

B 输出给 A（A 在作品广场、学习榜单、个人看板、主管看板消费）：
- `GET /api/posts/:id/leads-count`：单作品客资数（A 用于"获客≥5"过滤、学习榜单排序）。
- `GET /api/posts/leads-count?ids=...`：批量按作品聚合客资数（A 在列表页一次性回填）。
- `notifications` 通用接收接口：A 端"作品指标刷新成功/失败"的提醒可以走该入口，但通知主表归 B 维护。

A/B 联调交界面（验收时四方在场）：
- 运营端"客资录入并分配销售"——B 主导，A 提供作品/账号下拉。
- 运营端"作品广场"过滤"获客≥5"——A 主导，B 提供 leads-count 口径。
- 销售端"标记成交"→ 教务端可见——B 完整链路。
- 主管端"客资看板/订单看板/协同看板"——B 主链，A 提供员工/账号筛选项。

---

## 二、统一枚举与状态机（前后端唯一来源）

> 原则：所有状态值前后端统一英文 code，前端展示用映射表，禁止前端硬编码中文。
> 旧数据迁移：在数据迁移阶段一次性回填，禁止运行期再做兼容判断。

### 2.1 客资 leads 主状态机（`status`）

```
新客资(new)
   ├── 已分配(assigned)            ─→ 销售跟进中(in_followup)
   │                                       ├── 协同中(in_collab)
   │                                       │       └─→ 运营处理中(op_handling) ─→ 销售跟进中
   │                                       └── 已添加通过(contact_added)
   │                                                ├── 已成交(deal_closed)  ─→ 转订单（见 §10）
   │                                                └── 无效(invalid)
   └── 无效(invalid)
```

允许的状态 code：`new | assigned | in_followup | in_collab | op_handling | contact_added | deal_closed | invalid`

### 2.2 添加状态（`add_status`）—— 销售加客户微信/抖音的过程

`未添加(not_added) → 已发送申请(applied) → 待通过(pending) → 客户未通过(rejected) → 运营已提醒(op_reminded) → 已添加通过(added)`

### 2.3 处理状态（`process_status`）—— 销售跟进的细颗粒度状态

`未联系(not_contacted) | 已发送申请(applied) | 待通过(pending) | 已通过(passed) | 沟通中(chatting) | 已报价(quoted) | 已成交(closed) | 无效(invalid)`

### 2.4 意向度（`intention_level`）

`高意向(high) | 中意向(mid) | 低意向(low) | 无效(invalid) | 待判断(pending)`

> 旧字段 `intention`（强意向/了解备用/弱）一次性映射：强→high，了解备用→mid，弱→low；之后停用，仅 read-only 留存做历史。

### 2.5 添加方式（`add_method`）

`主动添加(active) | 被动添加(passive) | 客户主动加(customer_init) | 未知(unknown)`

### 2.6 协同任务状态（`collaboration_tasks.status`）

`待处理(pending) → 处理中(handling) → 已处理(handled) → 已关闭(closed)`
配套类型 `type`：`提醒客户(remind_customer) | 补充信息(supplement_info) | 确认身份(verify_identity) | 二次触达(second_touch)`

### 2.7 订单状态（`orders.order_status`）

`待接收(to_receive) → 进行中(in_progress) → 待客户资料(awaiting_client_info) → 待老师安排(awaiting_teacher) → 待交付(to_deliver) → 已完成(completed) | 异常(abnormal)`
付款状态 `paid_status`：`未付款(unpaid) | 部分付款(partial) | 已付款(paid)`

---

## 三、问题 1：销售端跟进看板可选意向度与处理状态

### 3.1 现状根因

- 当前销售端跟进看板只有 checkbox 风格的"已接 / 已添加"两态，无法表达 §2.3、§2.4 的多状态。
- "已添加"按钮只更新列表 flag，不跳转跟进详情，导致销售无法填写跟进备注与下次跟进时间。
- `lead_follow_records` 表 DDL 已存在但代码未启用，跟进备注无历史轨迹。

### 3.2 数据模型

`leads` 表新增/启用字段：
```sql
ALTER TABLE leads
  ADD COLUMN lead_code        VARCHAR(32)  UNIQUE COMMENT '客资编号 L<yyyymmdd>-<seq>',
  ADD COLUMN intention_level  ENUM('high','mid','low','invalid','pending') DEFAULT 'pending',
  ADD COLUMN process_status   ENUM('not_contacted','applied','pending','passed','chatting','quoted','closed','invalid') DEFAULT 'not_contacted',
  ADD COLUMN add_method       ENUM('active','passive','customer_init','unknown') DEFAULT 'unknown',
  ADD COLUMN next_follow_time DATETIME NULL,
  ADD COLUMN matched_post_id  VARCHAR(64) NULL;
```

启用 `lead_follow_records`（DDL 已有）：
```sql
-- 字段：id, lead_id, user_id, follow_type, content, next_follow_time, created_at
-- follow_type: phone/wechat/meeting/other
```

### 3.3 后端 API

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| PATCH | `/api/leads/:id` | 销售更新意向度、处理状态、下次跟进时间，**保存即写入 follow_records** | 分配销售本人 / 主管 |
| POST | `/api/leads/:id/follow-records` | 新增一条跟进记录（content 必填） | 同上 |
| GET | `/api/leads/:id/follow-records` | 跟进时间线，倒序分页 | 分配销售本人 / 主管 |

PATCH 接口规则：
- 任一关键字段（intention_level / process_status / next_follow_time / 跟进备注）变更，原子写入 1 条 follow_record，避免"改了状态没记录"。
- 保存失败时返回 422，前端禁止清空表单（见 §6 草稿规则）。

### 3.4 前端交互

- 跟进看板每张卡片：
  - 顶部状态行：意向度下拉 + 处理状态下拉 + 下次跟进时间选择器。
  - 中部：跟进备注 textarea + "保存" 按钮。
  - 底部："查看跟进时间线" 抽屉，分页加载 follow_records。
- 旧"已添加" checkbox 改为按钮："标记客户已通过 →"，点击后弹出处理状态切换 + 跟进备注，必须填写后保存。
- 保存成功 toast；失败时保留 form，5 秒后允许重试。

### 3.5 验收

- AC-1.1：销售点击"已添加"后，跟进详情可保存意向度、处理状态、跟进备注、下次跟进时间。
- AC-1.2：每次保存生成一条 follow_record，可在时间线查看。
- AC-1.3：销售改状态后，主管端客资看板对应字段同步刷新（见 §5）。

---

## 四、问题 2：被动添加客资识别与反馈闭环

### 4.1 现状根因

- 客资无唯一编号，销售拿到的是"昵称 + 手机号"碎片信息；一旦客户主动加销售，销售无法回查。
- 缺"待确认被动添加"承接列表与模糊匹配能力。

### 4.2 数据模型

- `leads.lead_code`（§3.2 已加）。
- 新增 `leads.add_method='passive'` 子流程：`source_unknown` 标记字段（boolean）允许销售先建后认。

生成规则：
- `lead_code = 'L' + YYYYMMDD + '-' + 当日序列号(4位补零)`，由后端在 INSERT 事务内自增。
- 历史数据迁移：按 created_at 顺序回填编号，保持单调。

### 4.3 后端 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/leads/passive/candidates?phone=&wechat=&nickname=` | 模糊匹配候选列表（销售提交客户信息时调用） |
| POST | `/api/leads/passive/bind` | 选定候选 → 绑定 add_method=passive 并补充销售反馈 |
| POST | `/api/leads/passive/new` | 匹配不到 → 新建被动客资（source_unknown=1，待运营确认） |
| POST | `/api/leads/:id/source-confirm` | 运营在客资看板确认来源（绑定 matched_post_id 与 source_operator_id） |

匹配口径（按权重打分，取 Top 5）：
- phone 完全匹配 +50；wechat 完全匹配 +50；
- nickname 模糊匹配（trigram 或包含）+20；
- 时间窗（分配时间在销售加微信前 7 天内）+15；
- 来源运营 +10。

### 4.4 前端交互

- 销售端新增菜单"待确认被动添加"。
- 表单字段：手机号、微信号、昵称、截图（可选）。提交即调候选接口。
- 候选列表展示：客资编号、来源作品缩略图、来源运营、分配时间、添加方式、当前状态。
- 选中"绑定"或"无匹配"按钮进入新建流程。
- 新建后客资进入运营端"待运营确认来源"列表，运营点确认即写 matched_post_id。

### 4.5 验收

- AC-2.1：销售提交手机号/微信号后能看到候选客资列表；选中即绑定且生成反馈记录。
- AC-2.2：匹配不到时能新建被动客资，运营端立刻可见并能补来源。
- AC-2.3：运营确认来源后销售端收到通知（"客户已通过/已添加"或"来源已确认"）。

---

## 五、问题 3：运营端客资看板数据修复

### 5.1 现状根因

- 运营端列表已按 employeeId 过滤，但顶部统计卡片（当月总数、筛选后数量、已分配、待处理）走的是前端本地数组 length 计算，与列表分页/过滤不同步，且本地缓存导致跨页错位。
- 主管端汇总口径与员工端口径分别由前端各自计算，存在差异。

### 5.2 修复策略

- **统计口径全部回到后端**：不允许前端用 `array.filter().length`。
- 后端新增聚合端点，员工端/主管端复用同一接口，仅 scope 不同：

```
GET /api/leads/stats?scope=self|employee|all&employeeId=&period=month|today|week|custom&...
返回：{ total, filteredTotal, assigned, pending, byStatus: {...}, byIntention: {...} }
```

- 前端筛选条件变化 → 同时刷新列表与 stats（同一 abort signal，避免错位）。
- 主管端"按员工筛选"传 `scope=employee&employeeId=xxx`；员工端固定 `scope=self`，后端根据 token 内 user_id 校验防越权。

### 5.3 验收

- AC-3.1：员工端"当月客资总数"等于该员工本月 leads 表条数（DB 直查为准）。
- AC-3.2：列表筛选后，"筛选后数量"= 列表总条数（含分页之外）。
- AC-3.3：主管端切到"员工 A"时数字与员工 A 自己看到的一致。
- AC-3.4：禁用前端缓存计算，刷新页面无差异。

---

## 六、问题 4 + 11：客资录入防闪退与图片解耦

### 6.1 现状根因

- 客资录入 form 状态保存在内存，刷新即丢；
- 图片上传组件直接挂在表单 onSubmit/state 上，selectFile/上传失败/重传 都会触发整体重渲染，把已填字段清空。

### 6.2 数据模型（草稿表）

```sql
CREATE TABLE lead_drafts (
  id           VARCHAR(64) PRIMARY KEY,
  user_id      VARCHAR(64) NOT NULL,
  draft_type   ENUM('lead','post') DEFAULT 'lead',
  content_json JSON NOT NULL,
  image_urls   JSON NOT NULL,
  updated_at   DATETIME ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_type (user_id, draft_type, updated_at)
);
```

保留策略：同 user + draft_type 最多保留 10 条，超出按 updated_at 删旧。

### 6.3 草稿保存触发点（防闪退核心）

- 输入停止 1s（debounce）→ 调 `PUT /api/lead-drafts/:id`（id 由前端首次进入页面生成 UUID 并落 localStorage）。
- 图片上传成功的 onComplete 回调 → 立即触发一次保存。
- 提交前再保一次，提交成功才 `DELETE /api/lead-drafts/:id`。
- 进入录入页时调 `GET /api/lead-drafts?user_id=&type=lead`，若有未提交草稿，弹"检测到未提交草稿，是否恢复"。

### 6.4 图片上传与表单解耦（问题 11 根治）

约束：
- 图片上传组件维护**独立**的 image_urls 状态，不参与文本表单的 form state；
- 图片选择/重传/删除/预览**仅修改自身状态**，并通过 onChange 把 image_urls 传出，但禁止反向触发表单 reset；
- 上传失败只 toast 图片失败，文本字段不变；
- 同样规则用于作品录入（A 端实施，本文不展开，但接口/规则一致）。

实现要点：
- 把图片上传抽成纯组件 `<UploadGallery value={imageUrls} onChange={setImageUrls} />`，使用受控 props 隔离；
- 文本表单走 `useReducer` 或独立 store，state 中根本不包含 image_urls。

### 6.5 后端 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/lead-drafts?type=lead` | 取当前用户草稿 |
| PUT | `/api/lead-drafts/:id` | upsert，body 含 content_json + image_urls |
| DELETE | `/api/lead-drafts/:id` | 提交成功后清理 |

### 6.6 验收

- AC-4.1：刷新/关浏览器/误点其他菜单后再回到客资录入，提示恢复并完整还原（含已上传图片）。
- AC-4.2：选/换/删图片后，已填的昵称/手机号/平台/账号字段保持不变。
- AC-4.3：图片上传失败仅出现图片失败提示，其他字段不变。
- AC-4.4：草稿表同一用户保留 ≤10 条。

---

## 七、问题 5：粘贴解析一键录入（客资）

### 7.1 实现思路

- 在客资录入页提供"粘贴解析模式"切换；进入后顶部一个大 textarea + 一个图片粘贴区。
- **解析放在后端**，前端只负责采集与展示预览，避免每个端口重复维护正则/字段词典。

### 7.2 后端 API

```
POST /api/leads/parse
body: { rawText: string, imageUrls: string[] }
resp: {
  parsed: {
    platform, accountKeyword, nickname, contact,
    contactType: 'phone|wechat|douyin|xhs|unknown',
    ip, sourcePostKeyword, operatorKeyword, status, remark
  },
  hits: { platform: 'matched'|'guess'|'unknown', ... }  // 命中说明
}
```

解析规则（轻量级，无 AI）：
- 平台关键字：小红书/红薯/xhs → xhs；抖音/dy → douyin；
- 联系方式：手机号 11 位正则；微信号 wxid_/字母数字混合；抖音号/小红书号关键字+数字；
- 字段拆分：以"客资 / 昵称 / 联系方式 / 来源 / 运营 / IP / 备注 / 状态"等中文锚点切片。
- 命中失败的字段不阻断提交，前端置空、保留底色提示。

### 7.3 前端交互

- 粘贴 textarea 触发 `Ctrl+V` 监听：识别图片直接走 §6 上传通道；识别文本调 parse 接口。
- 解析返回后进入"预览编辑"区，所有字段可手动修改。
- 提交按钮调 `POST /api/leads`（与单条录入同接口，仅多带 `source: 'parsed'` 标记便于审计）。

### 7.4 验收

- AC-5.1：粘贴一段群消息文本 + 图片，能自动填充至少 4 个字段（平台、联系方式、昵称、来源）。
- AC-5.2：未识别字段为空但允许提交。
- AC-5.3：提交后 leads.source='parsed'，可在主管端审计列表中筛选。

---

## 八、问题 7（客资侧）：客资批量导入

### 8.1 数据模型

启用 DDL 中已有：
```sql
import_tasks(
  id, import_type ENUM('lead','post'), user_id,
  total_count, success_count, fail_count,
  error_file_url, status ENUM('processing','done','failed'),
  created_at, finished_at
)
```

### 8.2 三种入口

- 单条录入（已有）。
- **批量粘贴录入**：textarea，每行一条，列分隔用 Tab/竖线/逗号自适应。
- **Excel 模板导入**：下载固定模板（与 leads 字段对齐，§2 枚举使用中文标签），上传后后端解析。

### 8.3 后端 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/leads/import-template.xlsx` | 下载模板 |
| POST | `/api/leads/import` | multipart 上传 Excel；返回 import_task_id |
| POST | `/api/leads/import-paste` | body: `rows: string[]`，同上 |
| GET | `/api/import-tasks/:id` | 进度查询；done 时附 success_count / fail_count / error_file_url |
| GET | `/api/import-tasks?type=lead` | 主管端：导入历史列表 |

校验规则：
- 必填项缺失（platform / contact / source_account_id）→ 失败行；
- contact 格式校验失败 → 失败行；
- 重复客资（同 phone/wechat 在 30 天内已存在）→ 失败行 + 冲突客资编号写入错误文件。

### 8.4 验收

- AC-7.1：100 条 Excel 中包含 5 条错误，导入完成提示"成功 95 / 失败 5"，并可下载错误文件查看失败原因。
- AC-7.2：主管端能查看谁在何时导入了多少条。

---

## 九、问题 10（客资侧）+ 通用稳定性要求

### 9.1 仅承担"客资录入 / 看板 / 详情"三页

- 列表分页强制：默认 20，最大 200。
- 请求防抖：搜索框 300ms；保存按钮 1s 内禁双击。
- 组件卸载清理：清 timer、AbortController.abort()、解绑全局事件。
- 长会话：Token 失效拦截器 → 先调一次草稿保存 → 再弹重新登录。
- WebSocket 通知断线 → 指数退避重连，不影响表单。

### 9.2 验收

- AC-10.1：客资录入页持续打开 1 小时，输入响应仍 < 200ms，提交 < 3s。
- AC-10.2：30 人并发录入，列表/看板首屏 < 2s。

---

## 十、订单与教务交付链路（B 端独立模块，承接成交）

> 该模块在 11 条反馈中未直接列出，但 V1.0 终稿四端口完整闭环要求 B 端必须交付。
> 与问题修复同期推进，不应单独延后。

### 10.1 触发点

销售在客资详情点击"标记成交"时：
- 客资 status → `deal_closed`；
- 自动 INSERT 一条 `orders`（leadId、salesId 自动带入）；
- 教务端订单池可见（status=`to_receive`）。

### 10.2 关键 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/leads/:id/close-deal` | 标记成交并创建订单（事务） |
| GET | `/api/orders?role=academic&status=...` | 教务端订单池 |
| GET | `/api/orders/:id` | 订单详情 |
| POST | `/api/orders/:id/follow-records` | 节点跟进 / 异常反馈 |
| PATCH | `/api/orders/:id` | 更新状态、付款状态、教务负责人 |

### 10.3 教务端 UI

- 订单池：列表 + 状态筛选 + 节点提醒红点。
- 订单详情：客户信息、销售信息、服务类型/金额/付款状态、节点时间线。
- 异常反馈：填写异常类型与说明 → 主管端收到通知。

---

## 十一、消息中心重构（B 端通用基础设施）

### 11.1 通知类型枚举（统一 code）

| code | 触发点 | 接收方 |
| --- | --- | --- |
| `lead_assigned` | 客资分配销售 | 被分配销售 |
| `collab_requested` | 销售发起协同 | 来源运营 |
| `collab_handled` | 运营处理协同 | 发起销售 |
| `customer_not_passed` | 销售反馈未通过 | 来源运营 |
| `customer_added` | 销售反馈已通过 | 来源运营 |
| `lead_source_confirmed` | 运营确认被动客资来源 | 销售 |
| `deal_closed` | 销售标记成交 | 主管 + 教务 |
| `order_node_due` | 教务节点临期 | 教务负责人 |
| `order_abnormal` | 教务反馈异常 | 销售 + 主管 |
| `import_done` | 批量导入完成 | 发起人 |

### 11.2 通知通道

- 数据库持久化（DDL 已有 notifications 表）+ WebSocket 推送（在线时实时弹）。
- 离线时下次登录看红点。
- 每个端口的"消息中心"按 `recipient_role` 过滤，主管端可看全量。

---

## 十二、数据库迁移步骤（按上线顺序）

> 全程不能 down 主流程。每步独立可回滚。

```
M1  schema.sql 增字段：leads(lead_code, intention_level, process_status,
     add_method, next_follow_time, matched_post_id, source_unknown)
M2  历史数据回填：lead_code 按 created_at 顺序生成；intention 旧值映射 intention_level
M3  新建表：lead_drafts, import_tasks
M4  启用：lead_follow_records, collaboration_tasks, orders, order_follow_records,
        notifications, exports（DDL 已有，前后端接入）
M5  ENUM 扩展：users.role 增加 'academic'
M6  灰度切流：B 端新接口 staging 联调 → 主管账号试用 → 全员开放
```

每步都需"上线前快照 + 回滚 SQL"。

---

## 十三、与 A 端的最终交界面验收清单

| 场景 | A 验收点 | B 验收点 |
| --- | --- | --- |
| 运营录入客资分配销售 | 作品/账号下拉数据正确（A） | 分配后销售端实时收到通知（B） |
| 作品广场"获客≥5"过滤 | A 列表只看到 leads_count ≥ 5（A） | `/api/posts/leads-count` 与主表口径一致（B） |
| 销售标记成交 | 主管端作品看板 deal_closed 数 +1（A 看板） | 教务端订单池新增 1 条（B） |
| 主管端客资看板 | 员工/账号筛选 UI 来自 A 接口 | 数据列与统计来自 B 接口 |
| 批量导入 | A：作品导入完成后通知（共用 import_tasks） | B：客资导入完成后通知 |

---

## 十四、最终验收（B 端总账）

| # | 验收项 | 通过条件 |
| --- | --- | --- |
| 1 | 销售跟进闭环 | 销售可保存意向度/处理状态/下次跟进时间，并能查跟进时间线 |
| 2 | 被动添加识别 | 销售能凭手机号/微信号识别客资或新建被动客资，运营可确认来源 |
| 3 | 客资看板数据 | 员工端/主管端统计与列表完全一致，所有口径来自后端聚合接口 |
| 4 | 防闪退草稿 | 刷新/崩溃后能恢复，提交成功才清空 |
| 5 | 图片解耦 | 任何图片操作不清空文本字段 |
| 6 | 粘贴解析 | 一段群文本+图片 4 字段以上自动填充 |
| 7 | 客资批量导入 | Excel/粘贴均可，支持失败行下载 |
| 8 | 卡顿稳定性 | 1 小时持续录入无卡死，30 人并发首屏 < 2s |
| 9 | 协同闭环 | 销售→运营→销售三方通知到位，状态流转无遗漏 |
| 10 | 订单链路 | 标记成交→订单创建→教务可见→节点跟进→异常通知 |
| 11 | 消息中心 | 10 类通知按角色过滤可见，离线持久化 |
| 12 | 导出 | 客资/订单/协同记录均可按当前筛选导出，敏感字段脱敏 |

---

## 十五、风险与不做事项

不在 B 端本轮范围（避免越界扩散）：
- 作品广场 / 学习榜单 / 作品收藏 / 作品指标手动刷新（A 主责）。
- AI 解析升级（V1.0 明确不含 AI）。
- 复杂分析看板（V1.0 第十五条明确不做）。

主要风险与规避：
- **状态枚举漂移**：上线前必须有"枚举常量唯一来源"模块（建议 `backend/src/common/enums.ts` + 前端共享）；评审 PR 时检查不允许直接写中文状态字符串。
- **历史 intention 映射回不去**：一次性映射后保留旧字段只读 30 天再删；避免业务侧期间双写。
- **草稿表膨胀**：定时任务清理 30 天前未提交草稿。
- **教务角色越权**：academic 仅在 port 3000 登录，且数据 scope=自己负责的 orders；上线前安全 review。
