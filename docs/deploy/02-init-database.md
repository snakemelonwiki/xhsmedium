# 步骤 2:初始化数据库

> 上一步装好 MySQL 后,本步:建库 → 建账号 → 导 schema。

## 30 秒摘要

```bash
sudo MYSQL_ROOT_PASSWORD='你的root密码' \
     APP_DB_PASSWORD='lan_system_user_强密码' \
     bash docs/deploy/scripts/init-database.sh
```

`init-database.sh` 自动:
1. 验证 `schema.sql` 存在(默认在 `/var/www/lan-system/schema.sql`)
2. `CREATE DATABASE lan_dual_role_system` 字符集 `utf8mb4_unicode_ci`
3. `CREATE USER lan_system_user@127.0.0.1` + `GRANT ALL ON 库.*`
4. 导入 `schema.sql`(所有表 + 索引 + 注释)
5. 打印表列表确认

## 默认值 / 可改

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `MYSQL_ROOT_PASSWORD` | (必填) | 步骤 1 装的 root 密码 |
| `APP_DB_NAME` | `lan_dual_role_system` | 业务库名 |
| `APP_DB_USER` | `lan_system_user` | 业务账号 |
| `APP_DB_PASSWORD` | (必填) | 业务账号密码,**别用 root 跑应用** |
| `APP_DB_HOST` | `127.0.0.1` | 库监听地址(与步骤 1 一致) |
| `PROJECT_ROOT` | `/var/www/lan-system` | 项目根目录(里面要有 schema.sql) |
| `SCHEMA_FILE` | `${PROJECT_ROOT}/schema.sql` | schema 文件位置 |

例:数据库想换名字

```bash
sudo MYSQL_ROOT_PASSWORD='xxx' \
     APP_DB_NAME=lan_system_v2 \
     APP_DB_USER=lan_user_v2 \
     APP_DB_PASSWORD='yyy' \
     bash docs/deploy/scripts/init-database.sh
```

## 跑完后

- 库:`lan_dual_role_system`(或你自定义)
- 账号:`lan_system_user@127.0.0.1`
- 表数量:约 30 张(看 v1.3 实际 migrations 进度)
- 默认 root 之外的账号才能连,root 仅运维用

## .env 模板

把这段贴到 `/var/www/lan-system/backend/.env`:

```ini
PORT=8089
OWNER_PORT=3001

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=lan_system_user
MYSQL_PASSWORD=lan_system_user_强密码
MYSQL_DATABASE=lan_dual_role_system

JWT_SECRET=替换为64位随机串
JWT_EXPIRES_IN=2h
```

(对应根目录的 `.env.example`,复制过来按需改)

## 如果跑应用时连不上

| 现象 | 排查 |
|------|------|
| `ER_ACCESS_DENIED_ERROR` | `.env` 里的 `MYSQL_USER`/`MYSQL_PASSWORD` 跟本步设的不一致 |
| `Unknown database 'lan_dual_role_system'` | `APP_DB_NAME` 跟 `.env` 的 `MYSQL_DATABASE` 不一致 |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL 没启动(`systemctl status mysql`)或 bind 不到 127.0.0.1 |
| 端口监听不对 | `ss -lntp \| grep 3306` 应该是 `127.0.0.1:3306` |

## 下一步

[步骤 3:部署应用](03-deploy-app.md)
