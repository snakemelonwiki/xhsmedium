# 步骤 1:装 MySQL 8

> 适用 Ubuntu 22.04 LTS。其他发行版(centos/debian)命令略不同。

## 30 秒摘要

```bash
# 1) 上传或 git clone 项目代码到服务器
git clone <你的仓库> /var/www/lan-system
cd /var/www/lan-system

# 2) 跑脚本(以 root)
sudo MYSQL_ROOT_PASSWORD='你的强密码' bash docs/deploy/scripts/install-mysql.sh
```

`install-mysql.sh` 自动完成:
1. `apt-get update` 拉索引
2. `apt-get install -y mysql-server mysql-client` 装 MySQL 8
3. 设 `root@localhost` 密码(用 `mysql_native_password` 认证)
4. 改 `bind-address = 127.0.0.1`(只允许本机,生产安全)
5. `systemctl enable/restart mysql` 开机自启
6. `mysqladmin ping` 等就绪
7. 打印版本 / 监听地址 / 数据库列表确认

## 跑完后

| 项 | 值 |
|----|---|
| 监听 | `127.0.0.1:3306`(只本机) |
| root 密码 | 你设的 `MYSQL_ROOT_PASSWORD` |
| 数据目录 | `/var/lib/mysql` |
| 配置文件 | `/etc/mysql/mysql.conf.d/mysqld.cnf` |
| 日志 | `/var/log/mysql/error.log` |
| 自启 | `systemctl is-enabled mysql` → enabled |

## 安全建议

- **生产不要**开 `0.0.0.0` 监听,本机 127.0.0.1 就够(应用部署在同一台机器)
- 如果应用和 DB **不在同一台机**:
  ```ini
  # /etc/mysql/mysql.conf.d/mysqld.cnf
  bind-address = 0.0.0.0
  ```
  + 防火墙只放行应用 IP 段,不要全开
- 用 `lan_system_user`(业务账号)代替 root 跑应用,root 只给运维人员

## 如果中途出错

| 现象 | 排查 |
|------|------|
| `E: Unable to locate package mysql-server` | 系统不是 Ubuntu 22.04 / 没更新 apt 源 / 在离线环境 |
| `debconf: unable to initialize frontend: Dialog` | 没 `export DEBIAN_FRONTEND=noninteractive`(脚本已设) |
| `mysqladmin: connect to server at '127.0.0.1' failed` | 防火墙拦截了 127.0.0.1 / 3306 没起来,`ss -lntp \| grep 3306` 看下 |
| 跑完没起来 | `journalctl -xeu mysql.service` 看错误 |

## 下一步

[步骤 2:初始化数据库](02-init-database.md)
