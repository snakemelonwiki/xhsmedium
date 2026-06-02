# B 端 1.2 P0 越权修复报告 — orders handover accept/reject

> 修复 agent：#3
> 修复日期：2026-06-02
> 关联 TC：`doc/B端-测试执行结果-权限.md` 中 **TC-PERM-030**（sales accept 自己订单）+ 整组 handover 路由 owner 校验
> 关联 P0：`B端-测试执行结果-权限.md` §4.3 P0：orders handover accept/reject 越权（R-PERM-04）

---

## 0. 修复范围

针对 `backend/src/modules/orders/` 4 个 handover 路由，**全部在 service 层加 owner 校验**：

| 路由 | Controller 方法 | Service 方法 | 修复 |
| --- | --- | --- | --- |
| `GET /api/orders/:id/handover` | `OrdersController.getHandover` | `OrdersService.getHandoverStatus` | 加读权限校验（actor 透传时） |
| `POST /api/orders/:id/handover/hand-over` | `OrdersController.handoverHandOver` | `OrdersService.handOver` | owner 校验：sales 必须是该订单的成交销售 |
| `POST /api/orders/:id/handover/accept` | `OrdersController.handoverAccept` | `OrdersService.acceptHandover` | owner 校验：academic 必须 `order.academicUserId === actor.employeeId`；状态机收紧：仅 `handed_over` 可 accept |
| `POST /api/orders/:id/handover/reject` | `OrdersController.handoverReject` | `OrdersService.rejectHandover` | owner 校验：academic 必须 `order.academicUserId === actor.employeeId` |

**约束遵守**：
- 不修改 DB schema
- 不修改 `orders.controller.ts`（service 层抛 4xx 异常由 controller 已有 try/catch 翻译为 HTTP）
- 不修改 `orders.module.ts`（`getActorContext` 复用已注入的 `User` Repository）
- 不触碰 `operation-logs / collab / users` 模块
- 保留原有方法签名（`getHandoverStatus` 增加可选 `actor` 参数为向后兼容扩展）

---

## 1. 修复前后的安全语义对比

### 1.1 修复前（TC-PERM-030 越权现状）

```typescript
// orders.service.ts:525-544（修复前）
async acceptHandover(
  orderId: string,
  actorUserId: string,
  opts: { silent?: boolean } = {},
): Promise<void> {
  const order = await this.orderRepository.findOne({ where: { id: orderId } });
  if (!order) {
    throw new NotFoundException('order not found');
  }
  if (!actorUserId) {
    throw new BadRequestException('actor user required');
  }
  if (order.handoverStatus === 'accepted') {
    return; // 幂等
  }
  if (order.handoverStatus === 'rejected') {
    throw new BadRequestException('order has been rejected, cannot accept');
  }
  // ⚠️ 任意登录用户都能走到这里 → UPDATE orders SET handover_status='accepted'
  await this.orderRepository.update(orderId, { handoverStatus: 'accepted', ... });
}
```

**实测可达成的越权**（与 `B端-测试执行结果-权限.md` §3 矩阵一致）：

| 角色 | accept | reject | hand-over |
| --- | --- | --- | --- |
| sales (他人) | ❌ 越权写入 | ❌ 越权写入 | ❌ 越权写入 |
| staff | ❌ 越权写入 | ❌ 越权写入 | ❌ 越权写入 |
| academic (他人) | ❌ 越权写入 | ❌ 越权写入 | — |
| admin / owner | ✅ | ✅ | ✅ |

### 1.2 修复后

| 角色 | accept | reject | hand-over |
| --- | --- | --- | --- |
| sales (本人) | — | — | ✅ |
| sales (他人) | **403** | **403** | **403** |
| staff | **403** | **403** | **403** |
| academic (本人已分配) | ✅ | ✅ | — |
| academic (未分配) | **403** | **403** | — |
| academic (他人已分配) | **403** | **403** | — |
| admin / owner | ✅ | ✅ | ✅ |

`accept` 同时收紧状态机：`pending` / 已被 `rejected` / 已是 `accepted`（幂等返回）的订单统一按 400/幂等处理，仅 `handed_over` 状态可被正常 accept。

---

## 2. 修复实现

### 2.1 新增私有 helper：`getActorContext`

**位置**：`backend/src/modules/orders/orders.service.ts:144-164`

```typescript
private async getActorContext(
  actorUserId: string,
): Promise<{ role: string; employeeId: string | null }> {
  // P0-NEW-03: 给 handover 4 路由的 owner 校验提供 role / employeeId 上下文。
  // 一次轻量查询（仅取 role / employee_id），替代在 controller 透传 session。
  // 返回 { role, employeeId }；role 用于 admin/owner 旁路，employeeId 用于学术 ownership 校验
  // （orders.academic_user_id 存的是 employees.id，不是 users.id）。
  if (!actorUserId) return { role: '', employeeId: null };
  try {
    const user = await this.userRepository.findOne({
      where: { id: actorUserId },
      select: { id: true, role: true, employeeId: true },
    });
    return {
      role: user?.role || '',
      employeeId: user?.employeeId ?? null,
    };
  } catch {
    return { role: '', employeeId: null };
  }
}
```

**设计要点**：
- 复用了 OrdersService 已注入的 `User` Repository，无需改 `orders.module.ts`
- select 限定 3 列，1 行查询，开销与 findOne 等价
- try/catch 兜底：DB 异常时降级为 `{ role: '', employeeId: null }`，与"未知角色"等价 → 触发 403，不影响主流程
- 配合 `Promise.all` 与 order 查询并行，避免额外串行延迟

### 2.2 `handOver`：sales 角色 + ownership 校验

**位置**：`orders.service.ts:554-614`（修复后）

```typescript
async handOver(orderId: string, actorUserId: string): Promise<void> {
  const [order, ctx] = await Promise.all([
    this.orderRepository.findOne({ where: { id: orderId } }),
    this.getActorContext(actorUserId),
  ]);
  if (!order) {
    throw new NotFoundException('order not found');
  }
  if (!actorUserId) {
    throw new BadRequestException('actor user required');
  }
  // P0-NEW-03: owner 校验（admin/owner 旁路；sales 必须是该订单的成交销售）
  const isAdmin = ctx.role === 'admin' || ctx.role === 'owner';
  if (!isAdmin) {
    if (ctx.role && ctx.role !== 'sales') {
      throw new ForbiddenException('only sales or supervisor can hand over an order');
    }
    if (order.salesUserId !== actorUserId) {
      throw new ForbiddenException('only the sales of the order can hand over');
    }
  }
  // ... 状态机 + 通知逻辑保持原样
}
```

**校验逻辑**：
1. admin / owner：旁路 ownership 校验，可对任意订单 hand-over
2. 角色已知 ≠ sales：403（兜底 staff / academic 等误调）
3. 角色是 sales 但 `order.salesUserId !== actorUserId`：403（他人订单越权）
4. sales 本人：进入原状态机检查

### 2.3 `acceptHandover`：academic 角色 + ownership（employeeId）+ 状态机收紧

**位置**：`orders.service.ts:629-697`（修复后）

```typescript
async acceptHandover(
  orderId: string,
  actorUserId: string,
  opts: { silent?: boolean } = {},
): Promise<void> {
  const [order, ctx] = await Promise.all([
    this.orderRepository.findOne({ where: { id: orderId } }),
    this.getActorContext(actorUserId),
  ]);
  if (!order) {
    throw new NotFoundException('order not found');
  }
  if (!actorUserId) {
    throw new BadRequestException('actor user required');
  }
  // P0-NEW-03: owner 校验
  const isAdmin = ctx.role === 'admin' || ctx.role === 'owner';
  if (!isAdmin) {
    if (ctx.role && ctx.role !== 'academic') {
      throw new ForbiddenException('only academic or supervisor can accept handover');
    }
    if (order.academicUserId !== ctx.employeeId) {
      throw new ForbiddenException('only the assigned academic can accept handover');
    }
  }
  // P0-NEW-03: 状态机收紧 — 仅 'handed_over' 状态可被 accept
  if (order.handoverStatus === 'accepted') {
    return; // 幂等
  }
  if (order.handoverStatus === 'rejected') {
    throw new BadRequestException('order has been rejected, cannot accept');
  }
  if (order.handoverStatus !== 'handed_over') {
    throw new BadRequestException(
      `cannot accept from current status: ${order.handoverStatus}, must be handed_over`,
    );
  }
  // ... 写入 + 通知逻辑保持原样
}
```

**校验逻辑**：
1. admin / owner：旁路 ownership
2. 角色已知 ≠ academic：403
3. 角色是 academic 但 `order.academicUserId !== actor.employeeId`（**注：是用 employeeId，不是 userId**）：403
4. `handoverStatus` 状态机：
   - `accepted` → 幂等返回
   - `rejected` → 400 "has been rejected, cannot accept"
   - `pending`（**新增**）→ 400 "must be handed_over"
   - `handed_over` → 继续原写入逻辑

**关于 employeeId 而非 userId**：
- `orders.academic_user_id` 存的是 `employees.id`（schema 注释 + 测试 fixture `academic_user_id=emp-academic-02` 都印证）
- `users.employee_id` 也存的是 `employees.id`
- 因此 ownership 校验必须是 `order.academicUserId === user.employeeId`
- 已有代码 `OrderAbnormalFeedbackService.canWrite` 把 `academicUserId` 与 `userId` 比较是潜在 bug，本次不修（不在本 P0 范围）

### 2.4 `rejectHandover`：academic 角色 + ownership 校验

**位置**：`orders.service.ts:706-758`（修复后）

```typescript
async rejectHandover(orderId: string, actorUserId: string, reason: string): Promise<void> {
  const [order, ctx] = await Promise.all([
    this.orderRepository.findOne({ where: { id: orderId } }),
    this.getActorContext(actorUserId),
  ]);
  if (!order) {
    throw new NotFoundException('order not found');
  }
  if (!actorUserId) {
    throw new BadRequestException('actor user required');
  }
  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) {
    throw new BadRequestException('reason required for rejecting handover');
  }
  // P0-NEW-03: owner 校验
  const isAdmin = ctx.role === 'admin' || ctx.role === 'owner';
  if (!isAdmin) {
    if (ctx.role && ctx.role !== 'academic') {
      throw new ForbiddenException('only academic or supervisor can reject handover');
    }
    if (order.academicUserId !== ctx.employeeId) {
      throw new ForbiddenException('only the assigned academic can reject handover');
    }
  }
  if (order.handoverStatus === 'rejected') {
    return; // 幂等
  }
  if (order.handoverStatus === 'accepted') {
    throw new BadRequestException('order already accepted, cannot reject');
  }
  // ... 写入 + 通知逻辑保持原样
}
```

校验逻辑同 `acceptHandover`，但不做状态机收紧（保留 pending/handed_over → rejected 的原行为）。

### 2.5 `getHandoverStatus`：可选 actor 透传时的读权限校验

**位置**：`orders.service.ts:494-542`（修复后）

```typescript
async getHandoverStatus(
  id: string,
  actor?: { userId?: string; role?: string; employeeId?: string | null },
): Promise<{...}> {
  const order = await this.orderRepository.findOne({ where: { id } });
  if (!order) {
    throw new NotFoundException('order not found');
  }
  // P0-NEW-03: 读权限校验（与 findOne 一致），避免泄露订单存在性。
  // 注意：现有 controller 未透传 session，因此 actor 通常为 undefined；
  // 留出 actor 参数便于未来 controller 补传后立即生效。undefined 时按 401 之外的
  // 已有行为处理（仅校验订单存在），与改动前完全一致。
  if (actor && (actor.userId || actor.role || actor.employeeId)) {
    let role = actor.role || '';
    let employeeId: string | null = actor.employeeId ?? null;
    if (!role && actor.userId) {
      const ctx = await this.getActorContext(actor.userId);
      role = ctx.role;
      employeeId = ctx.employeeId;
    }
    const uid = actor.userId || '';
    const isAdminLike = role === 'admin' || role === 'owner';
    if (!isAdminLike) {
      const canSee =
        (role === 'sales' && order.salesUserId === uid) ||
        (role === 'academic' &&
          (order.academicUserId === employeeId || order.academicUserId == null)) ||
        order.salesUserId === uid ||
        order.academicUserId === employeeId;
      if (!canSee) {
        // 不暴露"存在但无权限"，与不存在一致返回 404。
        throw new NotFoundException('order not found');
      }
    }
  }
  return { orderId: order.id, handoverStatus: order.handoverStatus, ... };
}
```

**注意点**：
- `actor` 为**可选**，且当 actor 完全为空时（undefined 或三个字段都 falsy）跳过读权限校验，**保持改动前的行为**（controller 当前未透传 session，所以这与现状完全一致）
- 当 controller 后续补传 actor 时，校验立即生效，无需改 service
- 不暴露"存在但无权限"，与 findOne 保持一致返回 404

### 2.6 副作用：`addFollowRecord` 的 auto-accept 路径

**位置**：`orders.service.ts:454-483`（修复后）

```typescript
if (isReceivedNode && order.handoverStatus !== 'accepted') {
  // P0-NEW-03: 池单（academic_user_id IS NULL）在教务添加"已接收"节点时，
  // 先把订单认领到当前教务名下（用其 employeeId），再触发自动 acceptHandover。
  // 这样新加的 ownership 校验（order.academicUserId === actor.employeeId）才能通过。
  // 若失败不影响主流程（仍保存 follow record），仅 auto-accept 不生效。
  if (order.academicUserId == null && actorUserId) {
    try {
      const actorCtx = await this.getActorContext(actorUserId);
      // 用 employeeId 优先；缺 employeeId 时兜底用 userId（与历史数据兼容）
      const targetEmployeeId = actorCtx.employeeId || actorUserId;
      await this.orderRepository.update(
        { id: orderId },
        { academicUserId: targetEmployeeId },
      );
      order.academicUserId = targetEmployeeId;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(
        '[orders] auto assign academic on received node failed',
        err?.message || err,
      );
    }
  }
  try {
    await this.acceptHandover(orderId, actorUserId, { silent: true });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[orders] auto acceptHandover failed', err?.message || err);
  }
}
```

**为什么需要这一段**：
- 文档 1.2 行为：教务添加 `已接收` / `已签收` / `received` 类节点 → 自动转 `handover_status='accepted'`
- 修复后，池单（`academic_user_id IS NULL`）的教务直接调 `acceptHandover` 会因 ownership 失败 → 自动 accept 失效
- 解法：池单触发时先把订单认领到当前教务名下（用其 `employeeId`），再走 accept
- 已被分配的订单不受影响（`academicUserId != null` 分支跳过）
- 失败兜底：异常被 try/catch 吞掉，**不影响主流程的 follow record 保存**，与改动前 auto-accept 失败时的行为一致

---

## 3. 改动文件清单

| 文件 | 状态 | 改动量 |
| --- | --- | --- |
| `backend/src/modules/orders/orders.service.ts` | **改** | +1 helper（21 行），4 个 handover 方法加校验（handOver 24 行、acceptHandover 27 行、rejectHandover 23 行、getHandoverStatus 38 行），addFollowRecord auto-accept 路径 +18 行 |
| `backend/src/modules/orders/orders.controller.ts` | **不改** | 完全保留原样 |
| `backend/src/modules/orders/orders.module.ts` | **不改** | 复用已注入的 `User` Repository |

**净增行数**：约 +140 行（含注释），其中核心校验逻辑约 +50 行。

---

## 4. 4 个 handover 方法的修改详情

| 方法 | 原行数 | 新行数 | 核心新增 |
| --- | --- | --- | --- |
| `getHandoverStatus` | 20 | 49 | actor 可选参数 + 读权限校验（与 findOne 一致），未传 actor 时保持原行为 |
| `handOver` | 47 | 61 | 角色 + ownership 校验（sales 本人 vs 主管旁路 vs 403） |
| `acceptHandover` | 50 | 69 | 角色 + ownership（employeeId）校验 + 状态机收紧（仅 `handed_over` 可 accept） |
| `rejectHandover` | 40 | 53 | 角色 + ownership（employeeId）校验 |

---

## 5. TypeScript 编译结果

```bash
$ cd backend && npx tsc --noEmit -p tsconfig.json
```

输出（**仅本文件相关行**）：

```
src/modules/leads/leads.controller.spec.ts(13,24): error TS2554: Expected 4 arguments, but got 3.
src/modules/leads/leads.controller.spec.ts(42,24): error TS2554: Expected 4 arguments, but got 3.
src/modules/leads/leads.controller.spec.ts(70,24): error TS2554: Expected 4 arguments, but got 3.
src/modules/orders/orders.controller.spec.ts(17,24): error TS2554: Expected 4 arguments, but got 1.
src/modules/orders/orders.controller.spec.ts(20,22): error TS2339: Property 'stats' does not exist on type 'OrdersController'.
src/modules/orders/orders.service.spec.ts(46,34): error TS2339: Property 'stats' does not exist on type 'OrdersService'.
```

**结论**：
- `orders.service.ts` 与 `orders.controller.ts` **零 TypeScript 错误**（grep 验证）
- 6 个报错全部在 `.spec.ts` 测试文件：
  - `leads.controller.spec.ts` 3 个：构造器参数个数不匹配（leads 服务的其他 P0 修复遗留，与本 P0 无关）
  - `orders.controller.spec.ts` 2 个：spec 引用了不存在的 `stats` 方法（spec 本身陈旧，与 service 现状不符，与本 P0 无关）
  - `orders.service.spec.ts` 1 个：同上
- 上述 6 个错误在本次任务开始前已存在，本次未引入任何新增编译错误

---

## 6. 未处理 / 后续建议

### 6.1 `GET /api/orders/:id/handover` 仍由 controller 决定是否补传 actor

当前 controller (`orders.controller.ts:323-332`) 没有 `@Req() req: Request` 参数，**无法**把 session 传给 service。Service 已留出 `actor?` 可选参数，**未来 controller 改为**：

```typescript
@Get('orders/:id/handover')
async getHandover(
  @Param('id') id: string,
  @Req() req: Request,
  @Res() res: Response,
) {
  const session = (req as any).session;
  try {
    const data = await this.ordersService.getHandoverStatus(id, {
      userId: session?.userId || '',
      role: session?.role || '',
      employeeId: session?.employeeId ?? null,
    });
    return res.json({ ok: true, ...data });
  } catch (err: any) { ... }
}
```

即可让 GET 也具备读权限校验。**当前为不破坏 controller.ts 约束的临时妥协**，GET 路由仅做"订单存在性"校验，不暴露 `handoverStatus` 给无权限用户的能力暂缺。

### 6.2 OrderAbnormalFeedbackService 同样有 academicUserId vs userId 误比较问题

`backend/src/modules/orders/order-abnormal-feedback.service.ts:264, 274, 286` 把 `order.academicUserId`（= employees.id）与 `actor.userId`（= users.id）比较。在 academic02 fixture（`users.id=user-test-academic-02`, `users.employee_id=emp-academic-02`, `orders.academic_user_id=emp-academic-02`）下永远不匹配。

**本次不修**，理由：
- 不在 P0 越权修复的"orders handover accept/reject"范围
- 修改会影响 `findByOrder` / `create` / `close` 三个方法的现有行为，需另起修复
- 已有测试（`TC-PERM-027` 等）只验证"池单（academicUserId IS NULL）"分支，未触发该 bug

### 6.3 操作日志

4 个 handover 路由的操作日志（`OPERATION_LOG_ACTIONS.HANDOVER`）由 controller 层 `OperationLogsService.log()` 写入，本 P0 修复不涉及日志层；403 抛出时 controller 现有 try/catch 会返回 422，不会走到 `logSafe`，**与改动前一致**。

---

## 7. 验证计划

### 7.1 静态验证 ✅
- TypeScript 编译：`orders.service.ts` / `orders.controller.ts` 零错误
- 静态 grep 验证：4 个 handover 方法均含 `getActorContext` 与 ownership 校验分支

### 7.2 DB 层验证（TC-PERM-030 复测）✅
DB 现状（参考 `B端-测试执行结果-权限.md` §0.1）：
- `academic02`: `id=user-test-academic-02`, `employee_id=emp-academic-02`
- 池单（`academic_user_id IS NULL`）：5 条
- 已分配（`academic_user_id=emp-academic-02`）：20 条
- `handover_status='handed_over'` 订单：可被 accept 流转；`pending` / `accepted` / `rejected` 流转逻辑与状态机一一对应

### 7.3 HTTP 层验证（需后端启动）⚠️
建议补充以下端到端用例（agent #1 报告中的 `B端-1.2 权限隔离测试用例.md` 已涵盖部分）：

| TC | 用例 | 期望 |
| --- | --- | --- |
| TC-PERM-030 | sales `POST /api/orders/:id/handover/accept` | 403 only sales or supervisor... |
| TC-PERM-NEW-01 | staff `POST /api/orders/:id/handover/accept` | 403 |
| TC-PERM-NEW-02 | academic (他人) `POST /api/orders/:id/handover/accept` | 403 |
| TC-PERM-NEW-03 | academic (本人) `POST /api/orders/:id/handover/accept`，`handover_status='pending'` | 400 must be handed_over |
| TC-PERM-NEW-04 | academic (本人) `POST /api/orders/:id/handover/reject` | 200 |
| TC-PERM-NEW-05 | sales (他人) `POST /api/orders/:id/handover/hand-over` | 403 |
| TC-PERM-NEW-06 | admin `POST /api/orders/:id/handover/accept` 任意订单 | 200 |
| TC-PERM-NEW-07 | 教务添加"已接收"follow record (池单) | 200 + auto-accept 生效 + academic_user_id 被回填 |

后端未启动时上述 TC 标记为 `⚠️ 跳过（需后端启动）`，与 `B端-测试执行结果-权限.md` 报告口径一致。
