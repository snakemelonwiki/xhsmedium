# P0-01 operation-logs 越权修复报告

## 修复前

`backend/src/modules/operation-logs/operation-logs.controller.ts` 完全没有任何角色校验:

```ts
// 修复前(精简)
import { Controller, Get, Param, Req, Res, Query } from '@nestjs/common';
...
@Controller('operation-logs')
export class OperationLogsController {
  @Get()              // 无 @UseGuards,无任何 role 检查
  async list(@Req() req, @Res() res, @Query('userId') userId?, ...) {
    // 直接用 query 参数中的 userId 过滤
    const rows = await this.service.list({ userId, ... });
  }

  @Get(':id')         // 无 @UseGuards
  async findOne(@Param('id') id, @Res() res) {
    // 任意登录用户都能 GET 任意 id 的日志
    return res.json(await this.service.findOne(id));
  }
}
```

grep 验证(修复前):
```
$ grep -E "UseGuards|Roles|getOwnerMain|role" backend/src/modules/operation-logs/operation-logs.controller.ts
0 匹配
```

任意登录用户(含 sales/staff/academic/owner)都能拉全表 35 条审计日志,存在严重信息泄露。

## 修复内容

修改 1 个文件:`backend/src/modules/operation-logs/operation-logs.controller.ts`

### 1) 类级别加 `@UseGuards(AuthGuard)`
所有 GET 接口必须先经 `AuthGuard` 验证 Bearer JWT,未登录/无 token/过期 token 一律 401。
复用 `backend/src/common/auth.guard.ts`(全局单例,在 `app.module.ts` 已 `configure`),无需新增依赖或模块。

### 2) `list()` 加角色分支
```ts
const session = (req as any).session;
const currentUserId: string = session?.userId || session?.id || '';
const sessionRole: string = session?.role || '';
const isAdminLike = sessionRole === 'admin' || sessionRole === 'owner';

// 非 admin/owner: 强制按本人过滤 userId,覆盖 query 参数中可能传入的任意值
const effectiveUserId = isAdminLike ? userId : currentUserId;
const rows = await this.service.list({ userId: effectiveUserId, ... });
```
- admin / owner: 保留原行为(可查全表,允许 `?userId=xxx` 指定用户)。
- 其他角色: 静默覆盖 `userId` query 参数为 `session.userId`,等价于 `WHERE o.user_id = session.userId`。

### 3) `findOne()` 加归属校验
```ts
const row = await this.service.findOne(id);
if (!row) return res.status(404).json({ message: '操作日志不存在' });

// 非 admin/owner: 越权访问统一返 404,避免通过 403/401 区分"存在但无权限"和"不存在"
if (!isAdminLike && row.userId !== currentUserId) {
  return res.status(404).json({ message: '操作日志不存在' });
}
return res.json(row);
```
- admin / owner: 不变(可看任意 id)。
- 其他角色: 仅当 `row.user_id === session.userId` 时返回 200;否则返 404(不返 403,防存在性泄露)。

### 4) service / module 保持不变
- `OperationLogsService.log()` 是系统内部写入入口,被 6 个模块调用(accounts / auth / users / orders / collaboration-tasks / order-abnormal-feedback),完全不在本 controller 暴露,无需任何守卫。
- `OperationLogsService.list() / findOne()` 保持纯 DB 方法语义不变,角色判定集中在 controller(与 `orders.controller.ts` 的做法一致)。
- `OperationLogsModule` 无变化(AuthGuard 已在 `app.module.ts` 全局配置)。

## 验证结果

### grep 装饰器出现次数
```
$ grep -cE "@UseGuards" backend/src/modules/operation-logs/operation-logs.controller.ts
1
$ grep -cE "@Roles" backend/src/modules/operation-logs/operation-logs.controller.ts
0
```
- `@UseGuards` 装饰器: 1 处(类级别,`@UseGuards(AuthGuard)`)
- `@Roles` 装饰器: 0 处(全代码库均不使用 `@Roles`,所有角色判定走内联 `role === 'admin' || role === 'owner'`,与 `orders.controller.ts`、`leads.controller.ts` 一致)

### role 分支数
- `list()`: 1 处角色分支(`isAdminLike ? userId : currentUserId`)
- `findOne()`: 1 处角色归属校验(`!isAdminLike && row.userId !== currentUserId`)
- service 层: 0 处角色条件(角色判定全在 controller,保持 service 纯净)

### TypeScript 编译
```
$ cd backend && npx tsc --noEmit
src/modules/leads/leads.controller.spec.ts(13,24): error TS2554 ...
src/modules/leads/leads.controller.spec.ts(42,24): error TS2554 ...
src/modules/leads/leads.controller.spec.ts(70,24): error TS2554 ...
src/modules/orders/orders.controller.spec.ts(17,24): error TS2554 ...
src/modules/orders/orders.controller.spec.ts(20,22): error TS2339 ...
src/modules/orders/orders.service.spec.ts(46,34): error TS2339 ...
```
**operation-logs 模块: 0 个错误**(已用 `git stash` 验证上述 6 个错误在我修改之前就已存在,且全部位于 `leads/` 和 `orders/` 的 `*.spec.ts` 文件,任务约束明确"不要触碰其他模块",因此不予修改)。

## 回归测试点

| TC 编号 | 场景 | 修复后预期 |
|---------|------|-----------|
| TC-PERM-056 | 未登录访问 `GET /api/operation-logs` | 401(由 AuthGuard 抛 `UnauthorizedException`) |
| TC-PERM-057 | sales01 登录后访问 `GET /api/operation-logs` | 200,只返回 user_id = sales01 自身的记录(原 35 条 → sales01 自己的 N 条);即使带 `?userId=其他用户` 也会被静默覆盖 |
| TC-PERM-058 | staff / academic 登录后访问 `GET /api/operation-logs` | 200,只返回自身记录 |
| TC-PERM-059 | admin / owner 登录后访问 `GET /api/operation-logs` | 200,返回全表 35 条,`?userId=xxx` 仍生效 |
| TC-PERM-060 | 非 admin/owner 访问 `GET /api/operation-logs/:id`(不属于自己) | 404(无信息泄露);访问自己产生的 id → 200 |

## 报告清单(给主 agent)

- **修改文件**: 1 个
  - `backend/src/modules/operation-logs/operation-logs.controller.ts`
- **未修改**: `operation-logs.service.ts`、`operation-logs.module.ts`(已确认无须改动)
- **@UseGuards 装饰器**: 1 处(类级别,`AuthGuard` 复用)
- **@Roles 装饰器**: 0 处(全代码库不引入此模式)
- **角色分支数(controller)**: 2 处(1 处在 list 强制 userId 过滤,1 处在 findOne 校验 userId 归属)
- **service 层 where 条件角色分支**: 0 处(按 controller 集中判定,符合现有 `orders.controller.ts` 模式)
- **TypeScript**: operation-logs 模块 0 错误;全仓 6 个错误均为其他模块的预存 `*.spec.ts` 问题,不在本任务范围
