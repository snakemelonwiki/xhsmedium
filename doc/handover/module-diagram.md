# NestJS 模块划分图

> 本项目为社交媒体运营中台系统，后端基于 NestJS 构建，共包含 35+ 个业务模块。以下按功能域进行模块划分与依赖关系梳理。

## 模块架构图

```mermaid
flowchart TB
    %% 核心基础设施
    subgraph CORE["核心基础设施"]
        style CORE fill:#fff0f0,stroke:#c0392b,stroke-width:2px
        auth["auth — 登录 / JWT 签发 / 密码校验"]
        users["users — 用户账号 CRUD"]
        employees["employees — 员工资料 + 关联登录账号"]
    end

    %% 客资管理
    subgraph LEADS["客资管理"]
        style LEADS fill:#f0f8ff,stroke:#2980b9,stroke-width:2px
        leads["leads — 客资核心"]
        leads_parser["leads-parser — 客资文本解析"]
        lead_drafts["lead-drafts — 客资草稿暂存"]
        parser["parser — 通用文本解析"]
    end

    %% 订单教务
    subgraph ORDERS["订单教务"]
        style ORDERS fill:#f0f8ff,stroke:#2980b9,stroke-width:2px
        orders["orders — 订单管理"]
        reminders["reminders — 教务节点提醒"]
    end

    %% 作品账号
    subgraph POSTS["作品账号"]
        style POSTS fill:#f0f8ff,stroke:#2980b9,stroke-width:2px
        posts["posts — 作品管理"]
        accounts["accounts — 社交账号管理"]
        favorites["favorites — 收藏夹"]
    end

    %% 数据分析
    subgraph ANALYTICS["数据分析"]
        style ANALYTICS fill:#f5f0ff,stroke:#8e44ad,stroke-width:2px
        analytics["analytics — 数据分析"]
        dashboard["dashboard — 总览仪表盘"]
        rankings["rankings — 运营排行榜"]
    end

    %% 协同任务
    subgraph COLLAB["协同任务"]
        style COLLAB fill:#f0fff0,stroke:#27ae60,stroke-width:2px
        collaboration_tasks["collaboration-tasks — 销售-运营协同任务"]
        supervisor_suggestions["supervisor-suggestions — 主管作品评审建议"]
    end

    %% 通知消息
    subgraph NOTIFY["通知消息"]
        style NOTIFY fill:#f0fff0,stroke:#27ae60,stroke-width:2px
        notifications["notifications — 站内消息通知"]
    end

    %% 导入导出
    subgraph EXPORT_IMPORT["导入导出"]
        style EXPORT_IMPORT fill:#f0fff0,stroke:#27ae60,stroke-width:2px
        exports["exports — 异步导出任务"]
        imports["imports — 数据导入"]
    end

    %% 爬虫
    subgraph SCRAPING["外部依赖"]
        style SCRAPING fill:#fff8e1,stroke:#e67e22,stroke-width:2px
        scraping["scraping — Playwright 爬虫调度"]
    end

    %% 销售端
    subgraph SALES["销售端"]
        style SALES fill:#f0f8ff,stroke:#2980b9,stroke-width:2px
        sales["sales — 销售专属接口"]
    end

    %% 工具与公共
    subgraph UTILS["工具与公共"]
        style UTILS fill:#f0fff0,stroke:#27ae60,stroke-width:2px
        operation_logs["operation-logs — 操作日志审计"]
        uploads["uploads — 文件上传"]
        tools["tools — 工具类接口"]
        enums["enums — 枚举常量定义"]
    end

    %% 其他
    subgraph OTHERS["其他"]
        style OTHERS fill:#fff5f0,stroke:#d35400,stroke-width:2px
        finance["finance — 财务相关"]
        teachers["teachers — 教师管理"]
        teacher_specialties["teacher-specialties — 教师专长"]
        teacher_order_types["teacher-order-types — 教师订单类型"]
        plaza_config["plaza-config — 广场配置"]
    end

    %% 依赖关系
    auth --> users
    auth --> employees
    users --> employees

    scraping --> posts
    posts --> accounts
    accounts --> scraping

    leads --> orders
    leads --> collaboration_tasks
    leads --> reminders
    orders --> reminders

    collaboration_tasks --> supervisor_suggestions

    leads --> operation_logs
    orders --> operation_logs
    posts --> operation_logs
    users --> operation_logs

    leads --> exports
    orders --> exports
    posts --> exports

    leads --> imports
    orders --> imports

    posts --> favorites
    accounts --> favorites

    analytics --> dashboard
    rankings --> dashboard

    leads --> notifications
    orders --> notifications
    collaboration_tasks --> notifications

    sales --> leads
    sales --> orders

    parser --> leads_parser
    leads_parser --> leads
    lead_drafts --> leads
```

## 模块组说明

### 核心基础设施

| 模块 | 说明 |
|------|------|
| `auth` | 登录鉴权：JWT 签发、密码校验（bcrypt + 明文双轨）、角色与端口绑定校验 |
| `users` | 用户账号 CRUD，密码管理，状态变更 |
| `employees` | 员工资料管理，关联登录账号，支持创建/重置密码/软删除 |

### 客资管理

| 模块 | 说明 |
|------|------|
| `leads` | 客资核心模块：录入、状态流转、跟进记录、协同、改派、导出 |
| `leads-parser` | 客资文本解析（粘贴识别），将非结构化文本转换为结构化客资 |
| `lead-drafts` | 客资草稿暂存，支持分步录入与暂存恢复 |
| `parser` | 通用文本解析工具，为基础解析能力提供支撑 |

### 订单教务

| 模块 | 说明 |
|------|------|
| `orders` | 订单管理：创建、交接、教务分配、节点提醒、成交状态流转 |
| `reminders` | 教务节点提醒，关联订单生命周期关键节点 |

### 作品账号

| 模块 | 说明 |
|------|------|
| `posts` | 作品管理：CRUD、来源识别、质量状态评估 |
| `accounts` | 社交账号管理（小红书/抖音），绑定作品与账号关系 |
| `favorites` | 收藏夹，支持作品收藏与分类管理 |

### 数据分析

| 模块 | 说明 |
|------|------|
| `analytics` | 数据分析：快照采集、趋势分析、平台统计 |
| `dashboard` | 总览仪表盘汇总接口，聚合各模块核心指标 |
| `rankings` | 运营排行榜，基于作品/账号表现生成排名 |

### 协同任务

| 模块 | 说明 |
|------|------|
| `collaboration-tasks` | 销售-运营协同任务，支持任务分配、跟进、关闭 |
| `supervisor-suggestions` | 主管作品评审建议，关联协同任务的质量把控 |

### 通知消息

| 模块 | 说明 |
|------|------|
| `notifications` | 站内消息通知，支持多端推送与消息中心 |

### 导入导出

| 模块 | 说明 |
|------|------|
| `exports` | 异步导出任务（CSV/Excel），支持大数据量异步处理 |
| `imports` | 数据导入（客资批量导入），支持模板校验与批量入库 |

### 爬虫（外部依赖）

| 模块 | 说明 |
|------|------|
| `scraping` | Playwright 爬虫调度，负责小红书/抖音指标抓取，为 `posts` 和 `accounts` 提供数据 |

### 销售端

| 模块 | 说明 |
|------|------|
| `sales` | 销售专属接口，包含 home-summary、deals 等业务视图 |

### 工具与公共

| 模块 | 说明 |
|------|------|
| `operation-logs` | 操作日志审计，关键写操作（创建/更新/删除/改派/重置密码）自动记录 |
| `uploads` | 文件上传（头像/引流截图），支持多类型文件存储 |
| `tools` | 工具类接口，提供通用辅助功能 |
| `enums` | 枚举常量定义，全系统共享枚举 |

### 其他

| 模块 | 说明 |
|------|------|
| `finance` | 财务相关模块 |
| `teachers` | 教师管理 |
| `teacher-specialties` | 教师专长配置 |
| `teacher-order-types` | 教师订单类型配置 |
| `plaza-config` | 广场配置管理 |

## 依赖关系总览

```mermaid
flowchart LR
    subgraph A["外部层"]
        scraping["scraping"]
    end

    subgraph B["业务层"]
        leads["leads"]
        orders["orders"]
        posts["posts"]
        accounts["accounts"]
        collaboration_tasks["collaboration-tasks"]
    end

    subgraph C["支撑层"]
        auth["auth"]
        users["users"]
        employees["employees"]
        exports["exports"]
        imports["imports"]
        notifications["notifications"]
        operation_logs["operation-logs"]
    end

    scraping --> posts
    posts --> accounts
    leads --> orders
    leads --> collaboration_tasks
    auth --> users
    auth --> employees
    users --> employees

    style scraping fill:#fff8e1,stroke:#e67e22
    style leads fill:#f0f8ff,stroke:#2980b9
    style orders fill:#f0f8ff,stroke:#2980b9
    style posts fill:#f0f8ff,stroke:#2980b9
    style auth fill:#fff0f0,stroke:#c0392b
    style users fill:#fff0f0,stroke:#c0392b
    style employees fill:#fff0f0,stroke:#c0392b
    style exports fill:#f0fff0,stroke:#27ae60
    style imports fill:#f0fff0,stroke:#27ae60
    style notifications fill:#f0fff0,stroke:#27ae60
    style operation_logs fill:#f0fff0,stroke:#27ae60
```

---

> 上图展示了模块间的核心依赖关系：`scraping` 抓取外部数据驱动 `posts` 和 `accounts` 模块，`leads` 作为客资入口驱动 `orders` 和 `collaboration-tasks` 等业务流，底层 `auth/users/employees` 为全系统提供身份与权限支撑。
