# B 端 1.2 P0 越权修复 — 报告 #5

> 修复日期：2026-06-02
> 修复 agent：#5 B 端 1.2 P0 越权修复 — users/employees 控制器无 AuthGuard + password 字段泄露
> 修复目标：`doc/B端-测试执行结果-权限.md` 中 **R-PERM-05**
> 严重等级：P0
> 工作分支：dev

---

## 0. 修复范围

| 模块 | 文件 | 状态 |
| --- | --- | --- |
| users | `backend/src/modules/users/users.controller.ts` | ✏️ Edit |
| users | `backend/src/modules/users/users.service.ts` | ✏️ Edit |
| employees | `backend/src/modules/employees/employees.controller.ts` | ✏️ Edit |
| employees | `backend/src/modules/employees/employees.service.ts` | ⚪ 未改（无 password 字段） |
| user.entity | `backend/src/entities/user.entity.ts` | ⚪ 未改（采用 service 层 map 方案） |
| DB schema | `schema.sql` / `users` / `employees` 表 | ⚪ 未改（不修改 DB） |
| auth.controller | `backend/src/modules/auth/auth.controller.ts` | ⚪ 未改（已正确） |
| AuthGuard | `backend/src/common/auth.guard.ts` | ⚪ 未改（已正确） |

---

## 1. 修复前 P0 风险

### 1.1 `GET /api/users` / `GET /api/users/staff` 泄露明文密码

`backend/src/modules/users/users.controller.ts:35-43`（修复前）：
```typescript
return res.json(users.map((u) => ({
  id: u.id,
  username: u.username,
  password: u.password,   // ⚠️ 明文密码字段直接透出
  role: u.role,
  employeeId: u.employeeId,
  status: u.status,
})));
```

`backend/src/modules/users/users.controller.ts:60-67`（修复前）：
```typescript
return res.json(users.map((u) => ({
  id: u.id,
  username: u.username,
  password: u.password,   // ⚠️ 同上
  role: u.role,
  employeeId: u.employeeId,
  status: u.status,
})));
```

**实测结果**（来自 `doc/B端-测试执行结果-权限.md` 0.2 节）：
- 11 个 fixture 账号 `password` 字段均为明文 `test123`（pw_len=7, pw_prefix=`test`）
- 任何未登录用户都能 `curl http://localhost:8089/api/users` 拉全表
- 数据范围：admin / staff / sales / academic / owner 全员账号

### 1.2 `GET /api/employees` 无 AuthGuard

`backend/src/modules/employees/employees.controller.ts:13`（修复前）：
```typescript
@Controller('employees')
export class EmployeesController {  // 无 @UseGuards
  // ...
}
```

**影响**：
- 任何未登录用户都能拉全表员工资料（含 employee_code / phone / hire_date）
- 任意登录用户能 POST/PUT/PATCH/DELETE 改员工资料

### 1.3 触发场景

| 攻击路径 | 触发条件 | 影响 |
| --- | --- | --- |
| `curl /api/users` 无 token | 端口对外开放 | 拿到全表账号 + 11 个明文密码 |
| `curl /api/employees` 无 token | 同上 | 拿到全表员工资料 |
| `POST /api/employees` 普通员工 | 登录后 | 任意创建员工并生成 EMP 编号 |
| `POST /api/users/staff` 普通员工 | 登录后 | 任意创建 staff 账号（无密码复杂度校验） |

---

## 2. 修复方案

### 2.1 方案选型

| 方案 | 优点 | 缺点 | 采纳 |
| --- | --- | --- | --- |
| **A.** `class-transformer` `@Exclude()` + `ClassSerializerInterceptor` | 全局生效 | 需在 entity 改 + interceptor；登录流程需特殊豁免 | ❌ |
| **B.** service 层 `map(toSafeUser)` | 显式零依赖、TypeORM 友好、不影响 login 流程 | 每个 service 方法都需加 map | ✅ |

**采纳 B 方案**。原因：
- 已 `class-transformer` 依赖但仓库内 0 使用（grep 0 匹配）— 引入新模式风险大
- login 走 `findByUsername` 返回 `User`（含 password），service 层 map 不影响 login 流程
- 改动集中在 users 模块 + employees 模块，scope 小

### 2.2 AuthGuard 选型

`backend/src/common/auth.guard.ts:16-89` 已实现标准 NestJS `AuthGuard`，校验 Bearer token、注入 `req.user` / `req.session`。直接复用，**不引入 `@Roles` 装饰器**（仓库内 0 匹配，保持与 leads / exports / collab 一致的内联角色校验风格）。

### 2.3 角色规则

| 端点 | admin | owner | staff | sales | academic | 未登录 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/users` | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /api/users/staff` | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `POST /api/users/staff` | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `GET /api/employees` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ 401 |
| `POST /api/employees` | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `PUT/PATCH /api/employees/:id` | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `PATCH /api/employees/:id/status` | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |
| `DELETE /api/employees/:id` | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 401 |

设计理由：
- 员工列表对所有已登录用户开放 — 用于改派/分配场景（与 posts / accounts 同等待遇）
- 员工资料变更（CRUD）限 admin/owner — 与「账号管理」同级敏感操作
- 用户账号 CRUD 限 admin/owner — 涉及密码写入
- 401 来自 `AuthGuard.canActivate` 的 `UnauthorizedException`
- 403 来自 controller 内联的 `hasRole` 校验

---

## 3. 代码变更详情

### 3.1 `users.service.ts`

**新增** 模块级 helper：
```typescript
function toSafeUser(u: User): Record<string, any> {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    employeeId: u.employeeId,
    status: u.status,
    createdAt: (u as any).createdAt,
    updatedAt: (u as any).updatedAt,
  };
}
```

**修改** 4 个查询方法统一过 `toSafeUser`：
- `findAll()` — 之前直接 `userRepository.find()` 含 password → 改 `rows.map(toSafeUser)`
- `findStaffUsers()` — 同上
- `findAllPaged()` — 之前内联 inline map（不含 password）→ 改 `rows.map(toSafeUser)` 保持一致
- `findStaffUsersPaged()` — 同上

**未改**：
- `findByUsername()` — 登录流程需要 password 字段（**不能过滤**）
- `create()` / `upsertStaffUser()` — 写入路径，不影响 GET 响应

### 3.2 `users.controller.ts`

**新增** import + helper：
```typescript
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';

function hasRole(session: any, allowed: string[]): boolean { ... }
function ensureAccountManager(req: Request, res: Response): boolean { ... }
```

**修改** 类装饰器：
```typescript
@Controller('users')
@UseGuards(AuthGuard)   // 新增
export class UsersController { ... }
```

**修改** 3 个方法：
- `findAll()` — 新增 `@Req() req`，方法首行 `if (!ensureAccountManager(req, res)) return;`
- `findStaffUsers()` — 同上
- `createStaff()` — 新增 `if (!ensureAccountManager(req, res)) return;`
- 移除 `users.map((u) => ({ ..., password: u.password, ... }))` 显式 password 引用（service 已不再返回 password）

### 3.3 `employees.controller.ts`

**新增** import + helper：
```typescript
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';

function hasRole(session: any, allowed: string[]): boolean { ... }
function ensureEmployeeAdmin(req: Request, res: Response): boolean { ... }
```

**修改** 类装饰器：
```typescript
@Controller('employees')
@UseGuards(AuthGuard)   // 新增
export class EmployeesController { ... }
```

**修改** 6 个方法：
- `findAll()` — 新增 `@Req() req`（业务规则：仅要求登录）
- `create()` — 新增 `if (!ensureEmployeeAdmin(req, res)) return;`
- `updateStatus()` — 新增 `@Req() req` + `if (!ensureEmployeeAdmin(req, res)) return;`
- `remove()` — 新增 `@Req() req` + `if (!ensureEmployeeAdmin(req, res)) return;`
- `updateEmployee()`（private）— 在首行加 `if (!ensureEmployeeAdmin(req, res)) return;`

**未改**：`employees.service.ts` — 实体无 password 字段，无需 service 层 map。

---

## 4. 验证

### 4.1 grep 审计（修复后）

```
$ grep -n "UseGuards|@Roles|password" backend/src/modules/users/users.controller.ts
8: * 序列化 User 时过滤敏感字段（password）。   # 注释
9: * 用于直接返回给 HTTP 响应的辅助方法 —— 不返回 password 哈希/明文。   # 注释
37:@UseGuards(AuthGuard)   # 新增 1 处
95:    const { username, password, employeeId, status } = body;   # POST body 解构，service 写入路径，不影响 GET 响应
103:      password,   # POST body 传参，service 写入路径

$ grep -n "UseGuards|@Roles" backend/src/modules/employees/employees.controller.ts
35:@UseGuards(AuthGuard)   # 新增 1 处

$ grep -n "password|toSafeUser" backend/src/modules/users/users.service.ts
8:  * 序列化 User 时过滤敏感字段（password）。  # 注释
9:  * 用于直接返回给 HTTP 响应的辅助方法 —— 不返回 password 哈希/明文。  # 注释
11: function toSafeUser(u: User): Record<string, any> {   # helper
33:  return rows.map(toSafeUser);   # findAll
41:  return rows.map(toSafeUser);   # findStaffUsers
53:  items: rows.map(toSafeUser),   # findAllPaged
70:  items: rows.map(toSafeUser),   # findStaffUsersPaged
98:  password: string;   # upsertStaffUser dto 字段（写入路径，不影响 GET）
108:  password: dto.password,   # service 写入
115:  password: dto.password,   # service 写入
```

**结论**：
- `@UseGuards(AuthGuard)` 出现 **2 次**（users + employees 各 1 次）
- `@Roles` 装饰器出现 **0 次**（保持与项目现有风格一致）
- password 字段在 GET 响应路径中 **完全过滤**（`toSafeUser` helper + controller 不再显式取 password）
- password 字段在写入路径（`POST /api/users/staff`）保留 — 必要行为

### 4.2 TypeScript 编译

```
$ cd backend && npm run build
> backend@0.0.1 build
> nest build
（无错误输出，exit 0）
```

`nest build` 通过。预先存在的 spec 文件错误（`leads.controller.spec.ts` / `orders.controller.spec.ts` / `orders.service.spec.ts`）与本修复无关，未触碰。

### 4.3 HTTP 行为预期（基于代码逻辑推演）

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| `GET /api/users` 无 token | 200 + 全表 11 个用户含明文 password | **401 missing bearer token** |
| `GET /api/users` staff 登录 | 200 + 全表含明文 password | **403 仅 admin/owner** |
| `GET /api/users` admin 登录 | 200 + 全表含明文 password | 200 + 全表 11 个用户，**不含 password** |
| `GET /api/users/staff` admin 登录 | 200 + staff 列表含明文 password | 200 + staff 列表，**不含 password** |
| `GET /api/users?limit=20&offset=0` admin | 200 + items 含 password | 200 + items，**不含 password** |
| `GET /api/employees` 无 token | 200 + 全表员工 | **401** |
| `GET /api/employees` staff 登录 | 200 | 200（业务规则允许 — 用于分配） |
| `POST /api/employees` staff 登录 | 200 创建员工 | **403 仅 admin/owner** |
| `DELETE /api/employees/:id` sales 登录 | 200 删除 | **403** |
| `PATCH /api/employees/:id/status` staff 登录 | 200 改状态 | **403** |
| 登录流程（`POST /api/auth/login`） | 正常 | 正常（service.findByUsername 走另一条路径，未过滤 password，登录凭证未受影响） |

### 4.4 login 流程影响验证

`backend/src/modules/auth/auth.service.ts:login`（grep 验证 `findByUsername`）走 `auth.service.login` → `userRepository.findOne({ where: { username } })` — 路径上**没有** `toSafeUser` 干预，password 字段保留，登录凭证未受影响。

---

## 5. 修复影响

| 维度 | 影响 |
| --- | --- |
| **安全** | 消除 P0 越权：未登录 / 普通员工无法拉用户全表 / 泄露明文密码；员工 CRUD 受限 admin/owner |
| **API 行为** | 未登录 → 401；非授权角色 → 403；admin/owner → 200（响应缺 password 字段） |
| **登录流程** | 无影响（service.findByUsername 走独立路径，password 字段保留） |
| **前端** | 已登录 admin/owner 用户无感；其他角色 GET /api/users 会收到 403 — 需前端根据 403 提示"权限不足"（前端代码改动不在本修复 scope） |
| **DB schema** | 未改 |
| **auth.controller** | 未改 |
| **AuthGuard** | 未改 |
| **业务模块** | 未触碰 operation-logs / orders / collab |

---

## 6. 修改的文件清单

| 文件 | 改动类型 | 行数变化 |
| --- | --- | --- |
| `backend/src/modules/users/users.controller.ts` | 重写 | 107 → 127（+20） |
| `backend/src/modules/users/users.service.ts` | 局部 | 112 → 134（+22） |
| `backend/src/modules/employees/employees.controller.ts` | 重写 | 147 → 177（+30） |

---

## 7. 关键指标

| 指标 | 数值 |
| --- | --- |
| `@UseGuards` 装饰器出现次数（本次修复） | **2**（users + employees 各 1） |
| `@Roles` 装饰器出现次数（本次修复） | **0**（采用内联 `hasRole` 校验，与仓库现有风格一致） |
| password 过滤方式 | **方法 B（service 层 map）** — `toSafeUser` helper |
| service 改写方法数 | 4（findAll / findStaffUsers / findAllPaged / findStaffUsersPaged） |
| TypeScript 编译 | ✅ nest build 无错（预先存在的 spec 错误与本修复无关） |
| DB schema 改动 | 0 |
| auth.controller 改动 | 0 |
| AuthGuard 改动 | 0 |
| 受影响 HTTP 端点数 | 9（users × 3 + employees × 6） |

---

## 8. 后续建议（不在本修复 scope）

1. **前端 403 提示**：admin/owner 之外的角色访问 `/api/users` 收到 403，前端需在 axios 拦截器加 `if (status === 403) showError('权限不足')`。
2. **password 明文迁移**：11 个 fixture 账号 password 仍为明文 `test`（BCrypt 兼容明文路径走的是明文比较），建议在 v1.2.1 跑一次 `bcrypt.hashSync('test', 10)` 迁移脚本（与 R-PERM-05 平行 P3 项）。
3. **@Roles 装饰器抽象**：仓库内 0 使用，但 users / employees / exports / collab 都用 inline 校验，可考虑在 `src/common/roles.decorator.ts` 抽一个 `Roles('admin', 'owner')` 装饰器 + `RolesGuard`（与本次修复平行，scope 不同的重构项）。
4. **`createStaff` 输入校验**：当前无 password 复杂度 / username 长度校验，建议加 `class-validator` @IsString @MinLength（与 #1 平行 P2 项）。

---

**报告结束。**

**修复结果：P0 越权 R-PERM-05 修复完成；2 个 controllers / 1 个 service 改写；9 个 HTTP 端点加固；TypeScript 编译通过；DB schema 与 auth 流程未改。**
