# 步骤 6:备份与恢复

> 至少两类:MySQL + uploads/。本目录提供了 `backup-db.sh` 和 `restore-db.sh`。

## 一键配置每日备份

```bash
# 1) 复制脚本到系统目录
sudo cp docs/deploy/scripts/backup-db.sh /usr/local/bin/backup-lan-system-db
sudo chmod +x /usr/local/bin/backup-lan-system-db

# 2) 准备备份目录
sudo mkdir -p /var/backups/lan-system/db
sudo chown -R root:root /var/backups/lan-system

# 3) 加 crontab(每天凌晨 3 点)
cat <<'EOF' | sudo crontab -
0 3 * * * /usr/local/bin/backup-lan-system-db >> /var/log/lan-system-backup.log 2>&1
EOF

# 验证
sudo crontab -l
```

## 备份内容

`backup-db.sh`:
- `mysqldump` 整个 `lan_dual_role_system` 库
- 输出 `/var/backups/lan-system/db/lan_dual_role_system_YYYYMMDD-HHMMSS.sql.gz`
- 自动保留 14 天,更老的删掉
- 写到 `/var/log/lan-system-backup.log`

**还要备份 uploads/**,加一条:

```bash
cat <<'EOF' | sudo crontab -
0 4 * * * tar -czf /var/backups/lan-system/uploads_$(date +\%F).tar.gz -C /var/www/lan-system uploads/
EOF
```

## 恢复

```bash
# 1) 找到要恢复的备份
ls -lt /var/backups/lan-system/db/ | head

# 2) 停 NestJS(避免恢复期间被读)
pm2 stop lan-system

# 3) 恢复
gunzip -c /var/backups/lan-system/db/lan_dual_role_system_20260601-030000.sql.gz \
  | mysql -h 127.0.0.1 -u lan_system_user -p lan_dual_role_system

# 4) 启回
pm2 start lan-system
```

## 异地备份(可选,推荐)

`rsync` 推到另一台机器 / OSS:

```bash
# /etc/cron.daily/lan-system-offsite
rsync -az /var/backups/lan-system/ backup@backup-server:/backups/lan-system/
```

或写 OSS,见 `docs/deploy/scripts/` 后续扩展(可加 `aliyun-oss-cli` / `aws s3 cp`)。

## 验证备份有效

每月做一次"恢复演练":

```bash
# 在另一台机器上(或 docker 起的临时 MySQL)恢复一份,看应用能否正常启动
docker run --name test-mysql -e MYSQL_ROOT_PASSWORD=test -p 3307:3306 -d mysql:8
gunzip -c backup.sql.gz | mysql -h 127.0.0.1 -P 3307 -u root -ptest
# 然后指向这台 3307 启一份 NestJS,看 API 正常
```

## 备份内容核对

| 项 | 频率 | 保留 |
|----|------|------|
| MySQL dump | 每天 1 次 | 14 天 |
| uploads/ tar | 每天 1 次 | 14 天(只新增 / 改动的文件) |
| .env | 每次部署前手动备份 1 次 | 长期(放 1Password / 团队密码库) |
| code-only.zip | 每次发布 | 长期(放 Git 即可) |
| 异地副本 | 每周 / 每天 rsync | 30 天 |

## 灾难恢复 SLA

- **RPO(可丢失数据)**:24 小时(每天 1 次备份)
- **RTO(恢复时间)**:30-60 分钟(取决于 dump 大小)
- 想 RPO 更短,改 crontab 频率 + 用 mysql replication(主从)
