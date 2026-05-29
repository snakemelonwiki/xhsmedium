# 运营中台四端口 — 系统业务流程图（Mermaid 版，目标交付）

> 更新日期：2026-05-29
> 依据：`doc/运营中台四端口.md`
> 目的：描述最终应交付的四端口目标态，不代表当前代码已全部实现

---

## 一、目标交付边界

目标态必须严格按四端口设计：

- 运营端
- 销售端
- 教务端
- 主管端

### 目标原则

- 不再单独保留 `owner` 第五端口
- 四端口共用同一套数据底座，但页面和权限分离
- 所有跨端协作要有状态和消息提醒
- 成交后必须进入订单与教务跟进链路
- 所有列表支持筛选、分页、排序和 Excel 导出

---

## 二、目标系统架构

```mermaid
graph TB
    subgraph 四端口
        A1[运营端]
        A2[销售端]
        A3[教务端]
        A4[主管端]
    end

    subgraph 应用服务
        B1[认证与权限]
        B2[作品域]
        B3[客资域]
        B4[订单域]
        B5[通知域]
        B6[导出域]
    end

    subgraph 数据底座
        C1[(users / employees / accounts)]
        C2[(posts / leads)]
        C3[(orders / order_follow_records)]
        C4[(notifications)]
        C5[(exports)]
    end

    subgraph 基础设施
        D1[(MySQL)]
        D2[(Redis)]
        D3[Socket.IO]
        D4[对象存储 / uploads]
        D5[队列 / 异步任务]
    end

    A1 & A2 & A3 & A4 --> B1
    B1 --> B2 & B3 & B4 & B5 & B6
    B2 --> C1 & C2
    B3 --> C1 & C2 & C4
    B4 --> C2 & C3 & C4
    B5 --> C4
    B6 --> C5
    C1 & C2 & C3 & C4 & C5 --> D1
    B5 --> D3
    B5 --> D2
    B6 --> D5
    B2 & B3 --> D4
```

---

## 三、目标角色权限

```mermaid
flowchart LR
    U1[运营] --> V1[自己的作品 / 客资 / 学习榜单 / 账号]
    U2[销售] --> V2[分配给自己的客资 / 跟进记录 / 订单]
    U3[教务] --> V3[已成交订单 / 交付节点 / 异常]
    U4[主管] --> V4[全局作品 / 客资 / 订单 / 员工 / 账号 / 导出]

    V1 --> X[不可看其他运营私密客资]
    V2 --> Y[不可看未分配客资]
    V3 --> Z[不可看未成交客资]
    V4 --> W[全局可见]
```

---

## 四、目标核心业务闭环

```mermaid
flowchart LR
    A[主管创建员工和账号] --> B[运营录入作品]
    B --> C[作品产生客资]
    C --> D[运营录入客资并分配销售]
    D --> E[销售跟进客户]
    E --> F{是否需要运营协同}
    F -->|是| G[运营处理协同]
    G --> E
    F -->|否| H{是否成交}
    H -->|否| E
    H -->|是| I[销售标记成交并创建订单]
    I --> J[教务端接收订单]
    J --> K[教务跟进交付节点]
    K --> L[主管全局查看与导出]
```

---

## 五、目标客资协同状态机

```mermaid
stateDiagram-v2
    [*] --> 新客资
    新客资 --> 已分配销售
    已分配销售 --> 销售跟进中
    销售跟进中 --> 申请运营协同
    申请运营协同 --> 运营处理中
    运营处理中 --> 运营已处理
    运营已处理 --> 销售跟进中
    销售跟进中 --> 已添加通过
    销售跟进中 --> 无效客资
    已添加通过 --> 已成交
    已成交 --> 教务订单池
    教务订单池 --> 教务跟进中
    教务跟进中 --> 已完成
```

---

## 六、目标通知体系

```mermaid
flowchart TD
    A[事件触发<br/>分配销售 / 协同申请 / 运营处理 / 添加通过 / 成交 / 教务异常] --> B[写入 notifications 表]
    B --> C[Socket.IO 实时推送]
    B --> D[消息中心离线补看]
    C --> E[运营端]
    C --> F[销售端]
    C --> G[教务端]
    C --> H[主管端]
    D --> E
    D --> F
    D --> G
    D --> H
```

---

## 七、目标订单与教务流程

```mermaid
flowchart TD
    A[销售标记成交] --> B[创建 orders]
    B --> C[通知教务端]
    C --> D[订单进入订单池]
    D --> E[教务查看订单详情]
    E --> F[更新进度节点]
    F --> G{是否异常}
    G -->|否| H[继续交付]
    G -->|是| I[反馈异常给销售/主管]
    H --> J[交付完成]
```

---

## 八、目标数据底座

```mermaid
erDiagram
    users ||--o| employees : employee_id
    employees ||--o{ accounts : employee_id
    employees ||--o{ posts : employee_id
    employees ||--o{ leads : employee_id
    leads ||--o| orders : lead_id
    orders ||--o{ order_follow_records : order_id
    users ||--o{ notifications : receiver_id
    users ||--o{ exports : user_id

    leads {
        varchar id PK
        varchar lead_code
        varchar matched_post_id
        varchar assigned_sales_user_id
        varchar process_status
        varchar add_status
        varchar intention_level
        varchar add_method
    }

    orders {
        varchar id PK
        varchar lead_id
        varchar sales_id
        varchar academic_admin_id
        varchar service_type
        decimal amount
        varchar paid_status
        varchar order_status
    }

    order_follow_records {
        varchar id PK
        varchar order_id
        varchar admin_id
        varchar node_type
        text content
    }

    notifications {
        varchar id PK
        varchar receiver_id
        varchar notification_type
        varchar read_status
    }

    exports {
        varchar id PK
        varchar user_id
        varchar export_type
        varchar status
    }
```

---

## 九、目标导出与性能要求

```mermaid
flowchart LR
    A[用户发起导出] --> B[创建 exports 任务]
    B --> C[异步生成 Excel]
    C --> D[文件落对象存储]
    D --> E[通知用户下载]

    F[作品列表] --> G[分页查询]
    H[客资列表] --> G
    I[订单列表] --> G
    G --> J[1.5s~2s 内返回]
```

### 目标要求

- 导出应走后端异步任务，不是前端一次性拉全量
- 列表查询必须分页
- 通知必须同时支持实时推送和离线补看
- 并发按 50-100 人同时在线设计

