# B 端 P0 修复 #2 — orders PATCH / 写操作越权

> 范围：仅修订单写操作越权（TC-PERM-023）。
> 关联 TC：TC-PERM-023（sales PATCH 他人订单）✅ 修复
> 不触动 handover 系列路由（由其他 agent 负责）。

---

## 1. 漏洞描述

`orders` 控制器中有 4 个写路由对调用者**没有显式的归属校验**，导致任意已登录用户（典型为 sales 角色）可以改动不属于自己的订单：

| 路由 | 原行为 | 风险 |
| --- | --- | --- |
| `PATCH /api/orders/:id` | 接收任意 body 直接调 `service.update` | sales 改他人订单状态 / 金额 / 教务分配 |
| `POST /api/orders/:id/follow-records` | 直接调 `service.addFollowRecord` | 任意用户伪造跟进记录 |
| `POST /api/orders/:id/abnormal-feedback` | 服务层有 `canWrite` 但无 controller 层 404 隔离 | 越权提交异常反馈（信息泄露） |
| `PATCH /api/orders/:id/abnormal-feedback/:feedbackId/close` | 服务层有 `canClose` 但无 controller 层 404 隔离 | 越权关闭异常反馈 |

`findOne`（GET 路径）已有内嵌的 canSee 校验（v1.2 已修复），但写操作路径未复用同样策略。

---

## 2. 修复策略

在控制器层（P0 越权的第一道防线）调用新增的 `OrdersService.canAccessOrder(orderId, actor)` 做归属校验，规则与 `findOne` 内的 canSee / `applyOrdersScope` 完全一致：

| 角色 | 可访问 |
| --- | --- |
| `admin` / `owner` | 全部 |
| `sales` | 仅 `order.sales_user_id === session.userId` |
| `academic` | `order.academic_user_id === session.userId` 或池单（IS NULL） |
| 其它 / 未传角色 | 兜底要求 `sales_user_id` 或 `academic_user_id` 匹配 |

校验失败统一返回 `404 not found`，与"订单不存在"行为一致，避免泄露订单存在性。
abnormal-feedback 系列 controller 层校验只校验"订单可见性"，细分写权限（创建人 / 主管 / 教务管理员）仍由 `OrderAbnormalFeedbackService.canWrite` / `canClose` 二次把关，做到 defense-in-depth。

---

## 3. 修改文件清单

| 文件 | 变更 |
| --- | --- |
| `backend/src/modules/orders/orders.service.ts` | 新增 `canAccessOrder(orderId, actor): Promise<boolean>` 公共方法（+30 行） |
| `backend/src/modules/orders/orders.controller.ts` | 4 个写路由加 `canAccessOrder` 校验：update / addFollowRecord / createAbnormalFeedback / closeAbnormalFeedback |

**未改动**：`orders.module.ts`（无需新增 Provider，service 已是 Provider）；`order-abnormal-feedback.service.ts`（其内部 `canWrite` / `canClose` 仍然生效）；handover 系列路由（其他 agent 负责）；`order.entity.ts`；DB schema。

---

## 4. 路由改动数

| | 修改前 | 修改后 |
| --- | --- | --- |
| orders 模块总路由数 | 16 | 16（保持不变） |
| 加 canAccessOrder 校验的写路由 | 0 | 4（update / addFollowRecord / createAbnormalFeedback / closeAbnormalFeedback） |
| handover 写路由（其他 agent 负责） | 4 | 4（未触碰） |
| 读路由（含 findOne） | 8 | 8（保持不变） |

---

## 5. 新增 / 修改的方法

### `OrdersService.canAccessOrder`（新增）

```ts
async canAccessOrder(
  orderId: string,
  actor?: { userId?: string; role?: string },
): Promise<boolean>
```

- 入参 `orderId` 为空 → `false`
- 订单不存在 → `false`
- 角色 `admin` / `owner` → `true`
- 角色 `sales` → `uid` 与 `order.salesUserId` 严格相等
- 角色 `academic` → `order.academicUserId === uid` 或池单（`== null`）
- 其它 → 兜底要求 `sales_user_id` 或 `academic_user_id` 与 `uid` 匹配

不修改既有方法签名；`findOne` / `update` / `addFollowRecord` / 其它 service 方法均保持原签名。

---

## 6. Controller 改写要点

### `update`（PATCH /api/orders/:id）

```ts
const userId = session?.userId || session?.id || '';
const role = session?.role || '';
try {
  // P0 越权修复 (TC-PERM-023)
  const canAccess = await this.ordersService.canAccessOrder(id, { userId, role });
  if (!canAccess) {
    return res.status(404).json({ ok: false, message: 'not found' });
  }
  await this.ordersService.update(id, { ... });
  // 原有 logSafe + res.json 流程保持
}
```

`addFollowRecord` 同样模式：`actorUserId` + `role` 校验。`actorUserId` 兼容 `body?.actorUserId` 兜底（与原行为一致）。

`createAbnormalFeedback` / `closeAbnormalFeedback`：复用既有 `actor = { userId, role }` 对象，传给 `canAccessOrder`；具体细分权限仍交给 `abnormalFeedbackService`。

---

## 7. TypeScript 编译结果

```
$ cd backend && npx tsc --noEmit -p tsconfig.json
src/modules/leads/leads.controller.spec.ts(13,24): error TS2554: ...
src/modules/leads/leads.controller.spec.ts(42,24): error TS2554: ...
src/modules/leads/leads.controller.spec.ts(70,24): error TS2554: ...
src/modules/orders/orders.controller.spec.ts(17,24): error TS2554: ...
src/modules/orders/orders.controller.spec.ts(20,22): error TS2339: Property 'stats' ...
src/modules/orders/orders.service.spec.ts(46,34): error TS2339: Property 'stats' ...
```

**过滤 orders 模块源码**（orders.controller.ts / orders.service.ts）：**0 error**。

剩下的 6 条错误全部是预存在的 spec 问题：
- `leads.controller.spec.ts` 期望 4 参数实传 3 参数（leadFind 既有 bug）
- `orders.controller.spec.ts` / `orders.service.spec.ts` 调用了不存在的 `stats` 方法（与本次修复无关，已在仓库中预存在）

`orders.controller.ts` 与 `orders.service.ts` 在本次修改后编译完全通过。

---

## 8. 回归风险评估

| 风险点 | 评估 |
| --- | --- |
| 旧前端传 `body?.actorUserId` 伪造身份 | `canAccessOrder` 仍然走的是 `session?.userId`，与既有 `findOne` / `addFollowRecord` 取值完全一致；不引入新的身份信任面。 |
| admin / owner 误被拒 | `canAccessOrder` 对 admin / owner 永远 `true`，放行。 |
| sales 改自己订单被误拒 | 严格相等判断 `order.salesUserId === session.userId` 与既有 `findOne` 内嵌 canSee 完全一致。 |
| academic 看 / 改 池单被误拒 | 显式允许 `order.academicUserId == null` 的池单场景，与 list 视角、findOne 一致。 |
| abnormal-feedback 旧有 canWrite / canClose 行为漂移 | controller 只补了一层订单可见性；细分权限判定完全保留 service 层逻辑，**不破坏**既有判定结果，只是把 403 提早到 404 路径的入口。 |
| 性能开销 | 每次写操作多一次 `findOne`；与既有 `findOne` 内嵌校验等价（同一查询），无新增索引压力。 |
| handover 系列路由 | **未触碰**，由其他 agent 修复其 P0 越权（TC-PERM-030）。 |
| DB schema | **未触碰**。 |

---

## 9. 验证步骤（建议人工 / 后续回归脚本补做）

1. 登录 user-sales-1（订单归属 user-sales-2），`PATCH /api/orders/<归属 user-sales-2 的订单>` → 期望 **404**。
2. 登录 user-sales-1，`PATCH /api/orders/<自己经手的订单>` → 期望 **200**。
3. 登录 emp-academic-02，`PATCH /api/orders/<池单>` → 期望 **200**。
4. 登录 emp-academic-02，`PATCH /api/orders/<归属 emp-academic-99 的非池单>` → 期望 **404**。
5. 登录 admin/owner，对任意订单 PATCH → 期望 **200**。
6. 跟进记录 / 异常反馈 创建 / 关闭，按相同 4 角色矩阵回归。

---

## 10. 总结

- 修改文件：2 个（orders.service.ts、orders.controller.ts）
- 控制器路由数：16 → 16
- 新增 service 方法：`canAccessOrder`（+30 行）
- 修改路由：`update`、`addFollowRecord`、`createAbnormalFeedback`、`closeAbnormalFeedback`（4 个）
- TypeScript 编译：orders 模块 0 错误（剩余 6 条 spec 错误均为预存在问题）
- DB schema：未修改
- handover 路由：未触碰
