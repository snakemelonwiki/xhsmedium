# A端测试环境数据审计报告

审计时间：2026-06-02  
审计范围：测试库 `lan_dual_role_system` 的 `users / employees / accounts / posts / leads / collaboration_tasks / orders / notifications / exports`。  
审计方式：仅查询 MySQL；未运行浏览器主流程。补数仅使用 `AGDATA_` 前缀记录，未删除、重置或修改非 `AGDATA_` 数据。

## 结论

本次任务要求的最小前置数据已补齐并复查通过：`staff1` 有账号、作品、客资和多状态客资；`staff2` 有对照作品/客资；`sales1` 有已分配客资；存在待处理/已处理/超时协同任务、staff1/admin2 消息、三种导出任务状态、1 条订单数据。

注意：`doc/A端测试用例-运营端.md` 和 `doc/A端测试用例-主管端.md` 中的完整规模要求仍未完全满足，例如运营 A 25 条作品/25 条客资、主管端 100 条多维作品/客资、20 条订单等。本报告只确认当前审计任务指定的最小可测前置条件。

## 复用账号

| 账号 | user_id | 角色 | employee_id | 员工 |
| --- | --- | --- | --- | --- |
| staff1 | user-test-staff-01 | staff | emp-test-staff-01 | E2E运营一 |
| staff2 | user-test-staff-02 | staff | emp-test-staff-02 | E2E运营二 |
| admin2 | user-test-admin-02 | admin | - | - |
| sales1 | user-test-sales-01 | sales | - | - |
| academic02 | user-test-academic-02 | academic | - | - |

## 审计后数据分布

| 表 | 总量 | AGDATA_ 补数 |
| --- | ---: | ---: |
| accounts | 180 | 0 |
| posts | 482 | 2 |
| leads | 128 | 9 |
| collaboration_tasks | 4 | 3 |
| orders | 1 | 1 |
| notifications | 20 | 6 |
| exports | 3 | 3 |

## 关键前置条件复查

| 检查项 | 结果 | 查询依据 |
| --- | --- | --- |
| staff1 至少 1 个账号 | 满足 | `accounts=1` |
| staff1 至少 2 条作品 | 满足 | `posts=3` |
| staff1 至少 2 条客资 | 满足 | `leads=12` |
| staff2 有对照作品/客资 | 满足 | `posts=2`，`leads=7` |
| sales1 有可分配/已分配客资 | 满足 | `assigned_sales_user_id='user-test-sales-01'` 共 10 条 |
| admin2 可用于主管全局视角 | 账号满足 | `role=admin` 且 `status=active`；接口可见性需浏览器/API 主流程另验 |
| 多状态客资 | 满足 | 覆盖 `new / assigned / in_collab / contact_added / deal_closed / invalid` |
| 协同任务 | 满足 | `pending=2`、`handled=1`、`timeout=1` |
| 消息 | 满足 | staff1 有协同申请、客户未通过、销售添加成功、主管建议；admin2 有协同超时、导出完成 |
| 导出任务 | 满足 | `processing / completed / failed` 各 1 条 |
| 优秀作品估算 | 满足 | 以 `leads` 关联 `post_id/matched_post_id` 估算，存在获客数 `>=5` 的作品；本次新增 staff1 两条 AGDATA 作品均为 5 条关联客资 |
| 订单入口数据 | 最小满足 | 新增 1 条 completed 订单；不满足主管端文档 20 条规模要求 |

## 补造数据 ID

### posts

| id | 归属 | 用途 |
| --- | --- | --- |
| AGDATA_POST_STAFF1_001 | staff1 | 补足 staff1 第二条作品、普通获客贴 |
| AGDATA_POST_STAFF1_EXCELLENT | staff1 | 优秀作品估算样本，关联客资数 5 |

### leads

| id | 状态 | 分配 | 用途 |
| --- | --- | --- | --- |
| AGDATA_LEAD_STAFF1_NEW | new / not_contacted / not_added | 未分配 | 未分配新客资 |
| AGDATA_LEAD_STAFF1_ASSIGNED | assigned / applied / pending | sales1 | 已分配/待添加 |
| AGDATA_LEAD_STAFF1_COLLAB | in_collab / pending / applied | sales1 | 待处理协同关联客资 |
| AGDATA_LEAD_STAFF1_ADDED | contact_added / passed / added | sales1 | 销售添加成功 |
| AGDATA_LEAD_STAFF1_DEAL | deal_closed / closed / added | sales1 | 成交客资与订单来源 |
| AGDATA_LEAD_STAFF1_INVALID | invalid / invalid / rejected | sales1 | 未通过/无效 |
| AGDATA_LEAD_STAFF1_EXCELLENT_1 | assigned / not_contacted / not_added | sales1 | 优秀作品关联客资 |
| AGDATA_LEAD_STAFF1_EXCELLENT_2 | assigned / not_contacted / not_added | sales1 | 优秀作品关联客资 |
| AGDATA_LEAD_STAFF2_CONTROL | assigned / not_contacted / not_added | sales1 | staff2 权限隔离对照 |

### collaboration_tasks

| id | 状态 | 关联 |
| --- | --- | --- |
| AGDATA_COLLAB_PENDING_001 | pending | AGDATA_LEAD_STAFF1_COLLAB |
| AGDATA_COLLAB_HANDLED_001 | handled | AGDATA_LEAD_STAFF1_ADDED |
| AGDATA_COLLAB_TIMEOUT_001 | timeout | AGDATA_LEAD_STAFF1_ASSIGNED |

### notifications

| id | 接收人 | 类型 |
| --- | --- | --- |
| AGDATA_NOTIFY_STAFF1_COLLAB | staff1 | collaboration_requested |
| AGDATA_NOTIFY_STAFF1_NOT_PASSED | staff1 | customer_not_passed |
| AGDATA_NOTIFY_STAFF1_ADDED | staff1 | customer_added |
| AGDATA_NOTIFY_STAFF1_SUPERVISOR | staff1 | supervisor_suggestion |
| AGDATA_NOTIFY_ADMIN2_COLLAB | admin2 | collaboration_timeout |
| AGDATA_NOTIFY_ADMIN2_EXPORT | admin2 | export_done |

### exports / orders

| 表 | id | 状态/类型 |
| --- | --- | --- |
| exports | AGDATA_EXPORT_PROCESSING | leads / processing |
| exports | AGDATA_EXPORT_COMPLETED | posts / completed |
| exports | AGDATA_EXPORT_FAILED | rankings / failed |
| orders | AGDATA_ORDER_COMPLETED_001 | paid / completed / accepted |

## SQL 摘要

本次写入均使用 `INSERT IGNORE`，避免重复运行造成重复数据：

- `posts`：插入 2 条 `AGDATA_POST_STAFF1_*`，归属 `emp-test-staff-01` 和 `acc-e2e-staff1-xhs`。
- `leads`：插入 9 条 `AGDATA_LEAD_*`，覆盖多状态，并将 8 条 staff1/1 条 staff2 客资分配或关联到 `sales1`。
- `collaboration_tasks`：插入 pending、handled、timeout 各 1 条 `AGDATA_COLLAB_*`。
- `notifications`：插入 4 条 staff1 运营消息、2 条 admin2 主管消息。
- `exports`：插入 processing、completed、failed 各 1 条。
- `orders`：插入 1 条 completed 订单，关联 `AGDATA_LEAD_STAFF1_DEAL`、`sales1`、`academic02`。

## 未满足完整文档规模的项

- 运营端文档要求运营 A 至少 25 条作品、25 条客资、3 条优秀作品；当前 staff1 为 3 条作品、12 条客资，优秀作品估算 2 条。
- 运营端文档要求协同任务至少待处理、已处理、超时均存在；当前已满足状态覆盖，但总量较小。
- 主管端文档要求至少 100 条作品、100 条客资、20 条订单、多类型导出；当前全局作品/客资数量满足 100 级别，但订单仅 1 条，导出类型仅 posts/leads/rankings。
- 员工停用、未绑定登录账号等管理类边界数据未补造；当前 employees 状态均为“在职”。
- admin2 “可看全局”仅通过账号角色与全局表分布判断，未跑 API/浏览器权限主流程。
