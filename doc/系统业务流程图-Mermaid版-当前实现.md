# 运营中台四端口 — 系统业务流程图（Mermaid 版，当前实现）

> 更新日期：2026-05-29
> 依据：当前仓库代码现状（`server.js`、`repositories.js`、`schema.sql`、`public/app.js`）
> 目的：描述现在已经实现的流程，不代表最终交付目标

---

## 一、当前实现边界

当前代码的重点是：

- 运营端、销售端、主管端共用 `3000` 端口
- `owner` 总后台走 `3001` 端口
- 以 `users / employees / accounts / posts / leads` 为主数据
- 作品、客资、排行榜、通知面板、基础导出、Playwright 抓取已存在
- 教务端、订单表、异步导出、WebSocket 实时推送尚未形成完整能力

### 当前明显未完整实现的目标能力

- 独立教务端角色与页面
- `orders / order_follow_records / exports / notifications` 数据表
- 成交后自动进入教务订单池
- Socket.IO 实时提醒
- 异步导出任务流

---

## 二、当前系统架构

```mermaid
graph TB
    subgraph 客户端
        C1[运营端 staff<br/>3000]
        C2[销售端 sales<br/>3000]
        C3[主管端 admin<br/>3000]
        C4[总后台 owner<br/>3001]
    end

    subgraph 服务端
        S1[Express server.js]
        S2[authRequired<br/>sessions Map]
        S3[requireRole]
        S4[posts / leads / rankings / dashboard / notifications]
    end

    subgraph 数据层
        D1[repositories.js<br/>MySQL 读写]
        D2[data.json<br/>本地回退]
        D3[daily-snapshots.json]
    end

    subgraph 外部资源
        E1[(MySQL<br/>5 张主表)]
        E2[(uploads/)]
        E3[Playwright 抓取指标]
    end

    C1 --> S1
    C2 --> S1
    C3 --> S1
    C4 --> S1
    S1 --> S2 --> S3 --> S4
    S4 --> D1
    S4 --> D2
    D1 --> E1
    D2 --> D3
    S4 --> E2
    S4 --> E3
```

---

## 三、当前认证与端口隔离

```mermaid
flowchart TD
    A[用户登录] --> B[POST /api/auth/login]
    B --> C[查询 users]
    C --> D{端口校验}
    D -->|3001 且 role=owner| E[允许登录]
    D -->|3000 且 role!=owner| E
    D -->|其他情况| F[403 拒绝]
    E --> G[生成 token<br/>写入 sessions Map]
    G --> H[前端 localStorage 持久化]
    H --> I[后续请求走 Bearer Token]
```

### 当前权限特征

- `staff` 只能按自己的 `employeeId` 看本人数据
- `admin / owner` 通常可看全量
- `sales` 当前并没有完整做到“只看 assignedSalesUserId 的客资”

---

## 四、当前数据模型

```mermaid
erDiagram
    users ||--o| employees : employee_id
    employees ||--o{ accounts : employee_id
    employees ||--o{ posts : employee_id
    employees ||--o{ leads : employee_id
    accounts ||--o{ posts : account_id
    accounts ||--o{ leads : account_id
    posts ||--o{ leads : post_id

    users {
        varchar id PK
        varchar username
        varchar password
        enum role
        varchar employee_id
        varchar status
    }

    employees {
        varchar id PK
        varchar employee_code
        varchar name
    }

    accounts {
        varchar id PK
        varchar employee_id
        varchar platform
        varchar account_name
        text posting_plan
    }

    posts {
        varchar id PK
        varchar employee_id
        varchar account_id
        varchar title
        varchar post_url
        varchar post_type
        bigint likes
        bigint comments
        bigint favorites
    }

    leads {
        varchar id PK
        varchar employee_id
        varchar account_id
        varchar post_id
        varchar contact_info
        varchar status
        varchar assigned_sales_user_id
        varchar process_status
        varchar add_status
        varchar intention
        decimal deal_amount
    }
```

---

## 五、当前作品流程

```mermaid
flowchart TD
    A[运营录入作品] --> B{录入方式}
    B -->|链接| C[保存作品基础信息]
    B -->|截图/封面| D[上传到 uploads/]
    B -->|手动| E[直接提交]

    C --> F[写入 posts]
    D --> F
    E --> F

    F --> G[创建通知<br/>仅本地 JSON 模式完整生效]
    F --> H[可手动抓取指标]
    H --> I[Playwright 拉取 likes/comments/favorites]
    I --> J[更新 posts 指标]
    J --> K[进入排行榜/看板]
```

---

## 六、当前客资流程

```mermaid
flowchart TD
    A[运营录入客资] --> B[写入 leads]
    B --> C{是否分配销售}
    C -->|是| D[写 assignedSalesUserId]
    C -->|否| E[保留待分配]

    D --> F[销售查看客资]
    E --> F

    F --> G[销售更新 addStatus / processStatus / intention]
    G --> H[销售填写 salesFeedback]
    H --> I[可提醒销售或运营]
    I --> J{结果}
    J -->|继续跟进| G
    J -->|成交| K[lead.status = 已成交<br/>填写 dealAmount]
    J -->|无效| L[lead.status = 无效]
```

### 当前实现限制

- 成交后仍停留在 `leads` 记录中
- 不会自动创建订单
- 不会进入教务端订单池

---

## 七、当前通知流

```mermaid
flowchart LR
    A[作品录入/客资录入/销售反馈/提醒操作] --> B[createNotification]
    B --> C[(data.json notifications)]
    C --> D[GET /api/notifications]
    D --> E[前端消息面板]
    E --> F[POST /api/notifications/:id/read]
```

### 当前实现限制

- 通知主要是轮询拉取，不是 WebSocket 实时推送
- 通知持久化是本地 JSON 逻辑，不是正式 `notifications` 表
- MySQL 模式下通知链路并不完整对齐本地模式

---

## 八、当前排行榜与导出

```mermaid
flowchart TD
    A[posts] --> B[作品数/流量聚合]
    C[leads] --> D[客资数/成交数聚合]
    B --> E[GET /api/rankings]
    D --> E
    B --> F[GET /api/dashboard/summary]
    D --> F
    C --> G[GET /api/leads/export]
```

### 当前实现限制

- 导出主要是客资导出
- 不是最终文档要求的完整异步 Excel 导出体系

