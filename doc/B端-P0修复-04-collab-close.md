# P0-04 collab close 越权修复报告

## 修复前

`backend/src/modules/collaboration-tasks/collaboration-tasks.controller.ts:197-212` 与
`backend/src/modules/collaboration-tasks/collaboration-tasks.service.ts:367-372` 组合下,
`PUT /api/collaboration-tasks/:id/close`(也即 P0 描述中的 `PATCH`)只查 `task` 是否存在,
不做任何归属校验,任何登录用户(含 sales/staff/academic/owner)都能关闭任意协同任务。

```ts
// 修复前 service.close
async close(id: string): Promise<CollaborationTask | null> {
  const task = await this.repo.findOne({ where: { id } });
  if (!task) return null;
  await this.repo.update(id, { status: 'closed' as CollaborationTaskStatus });
  return this.repo.findOne({ where: { id } });
}

// 修复前 controller.close
@Put(':id/close')
async close(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
  const session = (req as any).session;
  const actorUserId = session?.userId || session?.id || '';
  const task = await this.service.close(id);  // ← 不传 actor
  if (!task) return res.status(404).json({ ok: false, message: 'not found' });
  // ... 写日志
  return res.json({ ok: true, task });
}
```

实际验证(`doc/B端-测试执行结果-权限.md` TC-PERM-037):
- sales02 调用 `PUT /api/collaboration-tasks/{sales01发起的taskId}/close` → 200,任务被关闭
- staff/operation 同样可以关闭任意任务
- admin/owner 是设计内允许,但不应与 sales/staff 等同

这与 `leads.service.ts:547 canAccessLead`、`orders.service.ts:324 update` 等模块已有的
越权修复模式不一致,且 controller 明明已读取 `session.userId / session.role` 却未使用,
存在明确的"有上下文但未做校验"漏洞。

## 修复内容

修改 2 个核心文件 + 1 个测试文件,共 3 个文件:

1. `backend/src/modules/collaboration-tasks/collaboration-tasks.service.ts`
2. `backend/src/modules/collaboration-tasks/collaboration-tasks.controller.ts`
3. `backend/src/modules/collaboration-tasks/collaboration-tasks.service.spec.ts`

### 1) `service.close` 新增 `actor` 参数 + 私有 `assertCanClose`

```ts
async close(
  id: string,
  actor: CollaborationActor = {},
): Promise<CollaborationTask | null> {
  const closeActor = this.normalizeActor(actor);
  const task = await this.repo.findOne({ where: { id } });
  if (!task) return null;
  // 幂等:已关闭的任务直接返回当前记录,避免重复写入与误报权限错误。
  if (task.status === 'closed') {
    return task;
  }
  // TC-PERM-037 P0 修复:仅任务发起人(requester)或 admin/owner 可关闭。
  // 销售员之间不能互关协同任务,运营也不能关闭(非处理权限)。
  await this.assertCanClose(task, closeActor);
  await this.repo.update(id, { status: 'closed' as CollaborationTaskStatus });
  return this.repo.findOne({ where: { id } });
}

/**
 * 校验协同关闭权限:
 * - admin / owner 可关闭任意任务(主管兜底)
 * - 其它角色:仅任务发起人(requester_id === actorUserId)可关闭
 * 失败抛 Error,controller 渲染 403。
 */
private assertCanClose(
  task: CollaborationTask,
  actor: CollaborationActor,
): void {
  if (actor.actorRole === 'admin' || actor.actorRole === 'owner') {
    return;
  }
  if (!actor.actorUserId) {
    throw new Error('close requires user');
  }
  if (task.requesterId !== actor.actorUserId) {
    throw new Error('no permission to close task');
  }
}
```

要点:
- 复用 `CollaborationActor` 类型(与 `handle` 路径同类型,签名一致)。
- 走 `normalizeActor` 兼容旧的 `service.close(id, string)` 调用风格(虽然当前 controller
  改为传对象,但保留兼容点可避免未来误用)。
- `task.status === 'closed'` 提前返回 task,符合"幂等 close"语义;不再走权限校验与 DB 写入。
- 权限拒绝不区分"不存在"和"无权",统一抛 `'no permission to close task'`,由 controller
  渲染 403。
- 复用既有 `OperationLogsService`,不改 schema、不改通知流。

### 2) controller 拆出 `runClose` 私有方法,同时暴露 PUT 与 PATCH

```ts
// 同时暴露 PUT 与 PATCH:销售端 /sales/collaboration 与运营端
// /operation/collaboration 对 close 接口使用不同 verb,需保持并存。
// NestJS 不允许多个 HTTP verb 装饰器修饰同一方法体,所以拆成两个 wrapper,
// 内部都委托到 runClose → service.close。TC-PERM-037 P0 修复:close 增加
// 发起人/管理员越权校验。
@Put(':id/close')
async closePut(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
  return this.runClose(id, req, res);
}

@Patch(':id/close')
async closePatch(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
  return this.runClose(id, req, res);
}

private async runClose(id: string, req: Request, res: Response) {
  const session = (req as any).session;
  const actorUserId = session?.userId || session?.id || '';
  const actorRole = session?.role || '';
  try {
    const task = await this.service.close(id, {
      actorUserId,
      actorRole,
    });
    if (!task) return res.status(404).json({ ok: false, message: 'not found' });
    // 写操作日志:协同任务关闭
    await this.logSafe({
      userId: actorUserId,
      action: OPERATION_LOG_ACTIONS.UPDATE,
      targetId: id,
      detail: { step: 'close' },
      req,
    });
    return res.json({ ok: true, task });
  } catch (err: any) {
    // assertCanClose 抛 'no permission' / 'close requires user' → 403;
    // 其它业务错误(理论上不应再出现)→ 422。
    const msg = err?.message || 'invalid';
    if (typeof msg === 'string' && /no permission|close requires user/i.test(msg)) {
      return res.status(403).json({ ok: false, message: msg });
    }
    return res.status(422).json({ ok: false, message: msg });
  }
}
```

要点:
- 同时暴露 `PUT :id/close`(原行为)与 `PATCH :id/close`(P0 描述中使用的 verb),
  模式与 `handle` 路由完全一致(见 controller `handlePut / handlePatch / runHandle`)。
- `runClose` 统一从 `req.session` 读取 `userId / role` 并组装 `CollaborationActor`,
  业务方法与权限入口完全解耦。
- HTTP 状态码语义化:`not found → 404`、`no permission → 403`、其它业务错误 → `422`。
- 操作日志保持原有 `OPERATION_LOG_ACTIONS.UPDATE` + `{ step: 'close' }` 结构,不影响
  `operation-logs` 已有写入端与查询端(其他模块的 `service.log()` 调用不经过此处)。

### 3) `handle` 路由已自带 owner 校验(无需改动)

`service.handle` 已通过 `assertCanHandle` 实现 owner 校验(详见 service.ts:329-355),
关键片段:

```ts
if (task.handlerId) {
  if (task.handlerId !== actor.actorUserId) {
    throw new Error('no permission to handle task');
  }
  return;
}
// pending 状态下回退到 lead 来源运营校验
const lead = await this.leadRepository.findOne({ where: { id: task.leadId }, ... });
if (!lead || lead.employeeId !== actor.actorEmployeeId) {
  throw new Error('no permission to handle task');
}
```

P0 描述里要求的"handle 路由也应检查 owner"已被 v1.2 既有修复覆盖,本次 P0-04 任务
不重复改动。controller 的 `runHandle` 也已正确传递 `actor`(`controller.ts:170-195`),
本次保持不变。

## 验证结果

### TypeScript 编译

```
$ cd backend && npx tsc --noEmit 2>&1 | grep -E "collaboration-tasks|collab"
(空)
```

`collaboration-tasks` 模块 0 错误。
全仓 6 个预存错误(`leads.controller.spec.ts` 3 处 + `orders.controller.spec.ts` 2 处 +
`orders.service.spec.ts` 1 处)均位于其他模块的 `*.spec.ts` 文件,任务约束"不触碰其他模块",
且与本次 P0-04 修复无关,未做改动。

### Jest 单元测试

```
$ cd backend && npx jest src/modules/collaboration-tasks/collaboration-tasks.service.spec.ts
Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

新增 6 个 `close` 单元测试,全部通过:

| 用例 | 角色 | 期望 |
| --- | --- | --- |
| `allows requester to close their own task` | sales(requester) | 200,status 写入 `closed` |
| `rejects another sales user closing someone else task` | sales(非发起人) | 抛 `no permission to close task`,不写 DB |
| `allows admin to close any task` | admin | 200,status 写入 `closed` |
| `allows owner to close any task` | owner | 200,status 写入 `closed` |
| `rejects operation/staff closing` | staff | 抛 `no permission to close task`,不写 DB |
| `is idempotent on already-closed task` | sales(发起人) | 直接返回已关闭 task,不再校验权限、不再写 DB |

原有的 `create` / `handle` 测试保持不变并继续通过(2 → 2),合计 8 passed。

### 路由对比

修复前:
- `PUT /api/collaboration-tasks/:id/close` — 任意登录用户可关闭任意任务(P0 越权)

修复后:
- `PUT /api/collaboration-tasks/:id/close` — requester / admin / owner 可关闭
- `PATCH /api/collaboration-tasks/:id/close` — 同上(P0 描述中的 verb 形式,新增 alias)

### 不破坏既有 v1.2 修复

- `applyCollabScope` / `normalizeScope`(v1.2 已修 scope 越权)未触碰
- `list` / `listPaged` / `listTimeouts` 行为未变
- `claim` 路由未触碰(不在本 P0 范围内)
- `handle` 路由与 `assertCanHandle` 未触碰(已具备 owner 校验)
- `scan-timeouts` 路由未触碰(已要求 admin/owner)

## 回归测试点

| TC 编号 | 场景 | 修复后预期 |
| --- | --- | --- |
| TC-PERM-037-1 | sales01(发起人)`PUT /api/collaboration-tasks/{自己的id}/close` | 200,`{ok:true,task:{status:'closed'}}` |
| TC-PERM-037-2 | sales02(非发起人)`PUT /api/collaboration-tasks/{sales01的id}/close` | **403** `no permission to close task`,DB 状态不变 |
| TC-PERM-037-3 | staff / operation `PUT /api/.../{任意id}/close` | **403** `no permission to close task` |
| TC-PERM-037-4 | academic `PUT /api/.../{任意id}/close` | **403** `no permission to close task` |
| TC-PERM-037-5 | admin `PUT /api/.../{任意id}/close` | 200,DB 写入 `closed` |
| TC-PERM-037-6 | owner `PUT /api/.../{任意id}/close` | 200,DB 写入 `closed` |
| TC-PERM-037-7 | PATCH verb(`PATCH /api/.../{id}/close`)sales02 | **403** 同 PUT |
| TC-PERM-037-8 | 已 `closed` 任务再次 `close` | 200,幂等返回原 task,不抛错不写 DB |
| TC-PERM-037-9 | 不存在的 id `close` | 404 `not found` |

## 报告清单(给主 agent)

- **修改文件**: 3 个
  - `backend/src/modules/collaboration-tasks/collaboration-tasks.service.ts`(`close` 签名加 `actor`、`assertCanClose` 私有方法、幂等短路)
  - `backend/src/modules/collaboration-tasks/collaboration-tasks.controller.ts`(`close` → `closePut / closePatch / runClose`,传 session 给 service,错误映射 403/422)
  - `backend/src/modules/collaboration-tasks/collaboration-tasks.service.spec.ts`(新增 6 个 `close` 测试,`describe('close (TC-PERM-037)')` 块)
- **未修改**:
  - `collaboration-tasks.module.ts`(无依赖变化)
  - `collaboration-tasks.controller.ts` 中 `list` / `claim` / `handle` / `scan-timeouts` / `timeouts`(均不在本 P0 范围)
  - `service.handle` 与 `assertCanHandle`(已具备 owner 校验,本次不重复)
  - `service.applyCollabScope` / `normalizeScope`(v1.2 修复,保持不变)
  - DB schema、`schema.sql`(无 DDL 变更)
  - 其他模块(operation-logs / orders / users / employees)
- **越权拦截层**: service 层(`assertCanClose`),与 `assertCanHandle` 风格一致;controller 负责 session 读取与 HTTP 状态码映射(403/404/422)
- **@UseGuards 装饰器**: 不涉及(`AuthGuard` 已在 P0-01 修复时类级别应用到 `CollaborationTasksController`)
- **TypeScript**: collab 模块 0 错误
- **Jest**: collab 模块 8/8 通过(2 原有 + 6 新增)
- **行为变化**:
  - 越权请求由"成功 200"变成"403 + 业务错误消息"
  - 已关闭任务 close 由"覆盖写入"变成"幂等返回"
  - 新增 PATCH verb alias 路由
