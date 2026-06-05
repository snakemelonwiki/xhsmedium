#!/usr/bin/env bash
# install-mysql.sh — 在 Ubuntu 22.04 上从零装 MySQL 8
#
# 用法(以 root 身份):
#   bash install-mysql.sh                   # 使用默认 root 密码 (从脚本里改)
#   MYSQL_ROOT_PASSWORD='xxx' bash install-mysql.sh   # 自定义
#
# 完成后:
#   - MySQL 8 装好,开机自启
#   - root@localhost 密码已设
#   - 监听 127.0.0.1:3306(暂不开放外网,安全)
#   - /var/log/mysql 已轮转

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "✗ 请用 root 或 sudo 跑本脚本"
  echo "  sudo bash $0"
  exit 1
fi

# 参数
export DEBIAN_FRONTEND=noninteractive
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-Caigua_root_2026!}"
MYSQL_BIND_ADDRESS="${MYSQL_BIND_ADDRESS:-127.0.0.1}"  # 只允许本机访问,生产环境推荐

echo "=== 步骤 1/5: 更新 apt 索引 ==="
apt-get update -y

echo "=== 步骤 2/5: 装 MySQL 8 Server + 客户端 ==="
# Ubuntu 22.04 默认源里就有 mysql-server-8.0
DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server mysql-client

echo "=== 步骤 3/5: 设 root 密码 + 关闭外网访问 ==="
# 用 debconf-seeded 方式预置 root 密码包(避免 apt 弹交互)
debconf-set-selections <<EOF
mysql-community-server mysql-community-server/root-pass password ${MYSQL_ROOT_PASSWORD}
mysql-community-server mysql-community-server/re-root-pass password ${MYSQL_ROOT_PASSWORD}
mysql-community-server mysql-community-server/default-auth-override select 'Use Strong Password Encryption (RECOMMENDED)'
EOF

# 通过 mysql --execute 设置 root 密码(首次安装后 root 用 auth_socket 登录)
mysql --execute="ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}'; FLUSH PRIVILEGES;"

# 限定只监听 127.0.0.1
sed -i "s/^bind-address.*/bind-address = ${MYSQL_BIND_ADDRESS}/" /etc/mysql/mysql.conf.d/mysqld.cnf

echo "=== 步骤 4/5: 启动 + 开机自启 ==="
systemctl enable mysql
systemctl restart mysql

# 等就绪(最多 30s)
for i in {1..30}; do
  if mysqladmin ping -h 127.0.0.1 -u root -p"${MYSQL_ROOT_PASSWORD}" --silent 2>/dev/null; then
    echo "  ✓ MySQL ping 通"
    break
  fi
  sleep 1
done

echo "=== 步骤 5/5: 验证 ==="
MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysql -h 127.0.0.1 -u root -e "
SELECT VERSION() AS version, @@bind_address AS bind_address;
SHOW DATABASES;
"

echo ""
echo "============================================================"
echo "✓ MySQL 8 安装完成"
echo "  root 密码: ${MYSQL_ROOT_PASSWORD}"
echo "  bind:     ${MYSQL_BIND_ADDRESS}:3306"
echo "  下一步:   bash init-database.sh"
echo "============================================================"
