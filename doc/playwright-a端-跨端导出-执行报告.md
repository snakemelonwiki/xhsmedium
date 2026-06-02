# A端跨端协同/导出/稳定性 Playwright 验收报告

- runId: `AGX_20260602135235`
- baseURL: `http://127.0.0.1:3013`
- backendURL: `http://127.0.0.1:8089/api`
- spec: `frontend/e2e/a-cross-live.spec.ts`

## 账号登录
- PASS staff1/test123、staff2/test123、admin2/test123、sales1/test123 均通过真实 `/api/auth/login` 登录。

## 造数说明
- 通过 staff1 正常 API `POST /api/leads` 创建客资：leadId=`d0bb9aff-8713-4c6d-bc61-4f59b7924f39`，contactInfo=`AGX_20260602135235_wx_001`，accountId=`acc-e2e-staff1-xhs`，postId=`3d3f34b0-9604-470f-b55a-e3c14bdf41ef`。

## 跨端链路
- PASS OP-E2E-001：staff1 创建客资并分配 sales1 后，sales1 可通过详情接口读取，且消息中心存在分配通知。
- PASS AD-E2E-001：admin2 可通过主管权限读取该客资详情。
- 通过 sales1 正常 API `POST /api/leads/d0bb9aff-8713-4c6d-bc61-4f59b7924f39/collaboration` 创建协同任务：taskId=`d7092db5-5462-45d4-8713-3062294c6fbc`。
- PASS OP-E2E-002：sales1 发起协同后 staff1 inbox 可见；staff1 处理后 sales1 requester 视角同步为 handled。
- PASS OP-E2E-003 / AD-E2E-002：sales1 更新添加状态后，staff1 与 admin2 读取同一客资状态为 added。

## 权限与安全
- PASS OP-SEC-001：staff2 直接读取 staff1 新建客资返回 403/404。
- PASS OP-14-006 / AD-SEC-002：staff1 创建 accounts 导出时即使传 scope=all，服务端也强制降级为 mine，避免导出全量账号。
- PASS AD-SEC-001：admin2 可读取员工/全局客资接口。

## 导出中心
- PASS OP-14-001/002/003：staff1 可创建 posts/leads/rankings 导出任务，并能在导出列表查询到任务。
- PASS AD-11-001/002/003/006/007：admin2 可创建 posts/leads/rankings/accounts 导出任务，并能在导出列表查询到任务。
- BLOCKED AD-11-004/005：本轮未创建 orders/collaboration_records 导出；任务建议覆盖包括 orders/collaborations，但本次重点命令中未要求插入订单数据，协同记录导出也未执行。
- admin2 posts: id=`aabe8cd9-35a9-4ae6-ab3f-09553b61e47d`, finalStatus=`completed`, fileUrl=`/api/uploads/view/exports/aabe8cd9-35a9-4ae6-ab3f-09553b61e47d.csv`
- admin2 leads: id=`41bd8344-00de-41f1-bd5c-e9ecfc5e230b`, finalStatus=`completed`, fileUrl=`/api/uploads/view/exports/41bd8344-00de-41f1-bd5c-e9ecfc5e230b.csv`
- admin2 rankings: id=`79b37bba-fc8a-4c81-bd0b-670efe775ad6`, finalStatus=`completed`, fileUrl=`/api/uploads/view/exports/79b37bba-fc8a-4c81-bd0b-670efe775ad6.csv`
- admin2 accounts: id=`585974d8-a814-4779-9536-15e2f91e0c36`, finalStatus=`completed`, fileUrl=`/api/uploads/view/exports/585974d8-a814-4779-9536-15e2f91e0c36.csv`
- staff1 posts: id=`c9e3726e-651d-4926-a86c-ef63fc1ca111`, finalStatus=`completed`, fileUrl=`/api/uploads/view/exports/c9e3726e-651d-4926-a86c-ef63fc1ca111.csv`
- staff1 leads: id=`9e4201c9-3347-45ef-861a-f24f552a00bb`, finalStatus=`completed`, fileUrl=`/api/uploads/view/exports/9e4201c9-3347-45ef-861a-f24f552a00bb.csv`
- staff1 rankings: id=`f309644d-0ea9-4f86-aca0-61f7bf62bf2c`, finalStatus=`completed`, fileUrl=`/api/uploads/view/exports/f309644d-0ea9-4f86-aca0-61f7bf62bf2c.csv`

## 页面与轻量性能
- OP-PERF-001 轻量：/operation/leads 首屏 `2477ms`，/operation/exports 首屏 `2481ms`。
- AD-PERF-001/003 轻量：/admin/leads 首屏 `4038ms`，/admin/exports 首屏 `2748ms`。
- 销售详情页同步验证：/sales/leads/d0bb9aff-8713-4c6d-bc61-4f59b7924f39 首屏 `2403ms`。
- 截图目录：`D:\workspace\workspace\xsh\xhsmedium\screenshots\a-cross-live`。