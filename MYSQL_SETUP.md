# MySQL 接入说明

## 1. 创建数据库

先在 MySQL 中执行：

```sql
source schema.sql;
```

或者把 `schema.sql` 内容复制到 MySQL 客户端执行。

## 2. 配置环境变量

复制一份：

```bash
cp .env.example .env
```

然后填写：

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`

## 3. 当前状态

这一步已经把：

- MySQL 依赖
- 连接配置
- 建表脚本
- 仓储层

都搭好了。

下一步需要把 `server.js` 的 JSON 读写逐步切换到仓储层。
