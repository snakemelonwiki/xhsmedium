#!/usr/bin/env bash
# ============================================================================
# install-pm2-logrotate.sh
# ----------------------------------------------------------------------------
# 一键安装并配置 PM2 日志切割插件, 配合 ecosystem.config.js 使用.
#
# 适用场景:
#   - 服务器上 3 个 Node 进程 (lan-legacy / lan-nestjs / lan-frontend) 由 PM2 托管
#   - 日志统一输出到 /var/log/lan-system/<app>-{out,error}.log
#   - 需求: 按天切割, 压缩, 保留 30 天
#
# 行为:
#   1) 全局安装 pm2 (如果还没装)
#   2) pm2 install pm2-logrotate
#   3) 配置策略:
#        max_size       50M     单文件超过 50M 立即切割 (兜底, 防止天量日志把磁盘打爆)
#        retain         30      保留 30 份 (按天切就是 30 天)
#        compress       true    gzip 压缩归档日志 (省 70-80% 空间)
#        dateFormat     YYYY-MM-DD  文件后缀带日期, 方便按天回溯
#        workerInterval 60 * * * *  cron 表达式: 每小时 0 分跑一次检查 (实际每天切一次)
#        rotateModule   true    模块日志也切割 (我们没用到 module 日志, 默认即可)
#   4) pm2 save, 让 logrotate 进程随 PM2 daemon 自启
#
# 不适用场景 (改用 docs/deploy/scripts/logrotate-lan-system):
#   - 不希望装 PM2 插件, 走系统 logrotate 切
#   - 二者选其一, 不要同时启用 (会产生日志竞争, 偶发丢行)
#
# 使用:
#   sudo bash docs/deploy/scripts/install-pm2-logrotate.sh
#
# 验证:
#   pm2 list                              # 看到 pm2-logrotate 在跑
#   pm2 show pm2-logrotate                # 看当前配置
#   pm2 set pm2-logrotate:retain 60       # 临时调成保留 60 天
#
# 卸载:
#   pm2 uninstall pm2-logrotate
# ============================================================================
set -euo pipefail

# ---- 0. 准备 -------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  echo "[ERR] 请用 sudo 跑 (pm2 是全局 npm 包, 需要写 /usr/lib/node_modules)"
  exit 1
fi

LOG_DIR="/var/log/lan-system"
mkdir -p "$LOG_DIR"
chown -R "$(logname 2>/dev/null || echo root):" "$LOG_DIR" 2>/dev/null || true

# ---- 1. 装 pm2 (如果没有) -----------------------------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[1/4] 装 pm2..."
  npm install -g pm2
else
  echo "[1/4] pm2 已装: $(pm2 --version)"
fi

# ---- 2. 装 pm2-logrotate 插件 -----------------------------------------
echo "[2/4] 安装 pm2-logrotate..."
pm2 install pm2-logrotate

# ---- 3. 写策略 (只覆盖我们关心的项, 其它保持默认) --------------------
echo "[3/4] 配置切割策略..."

# 50M: 单文件超过立即切, 防凌晨高峰期一晚上把磁盘打爆
pm2 set pm2-logrotate:max_size 50M

# 30: 保留 30 份 (按天切 ≈ 30 天; 按 50M 切 ≈ 30×50M=1.5G, 仍可调整)
pm2 set pm2-logrotate:retain 30

# gzip 压缩, 30 天 × 50M gzip 后约 200-300MB, 磁盘压力可接受
pm2 set pm2-logrotate:compress true

# 归档文件名: /var/log/lan-system/lan-legacy-out__2026-06-07_14-23-11.log.gz
# 日期格式保证按天可读
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss

# workerInterval: cron 表达式, 每小时 0 分扫一次, 看到文件超 50M 或日期跨天就 rotate
# 注意: PM2 cron 是 UTC, 如果服务器时区是 +8, rotate 时间 = 每天 8:00 / 10:00 / ...
#       实测够用, 不强求精确 0 点.
pm2 set pm2-logrotate:workerInterval "0 * * * *"

# 启用模块日志切割 (我们没用 PM2 module, 默认 false 也行, 这里显式开保险)
pm2 set pm2-logrotate:rotateModule true

# ---- 4. 保存 PM2 进程表, 配合开机自启 (pm2 startup 需另跑) ------------
echo "[4/4] pm2 save..."
pm2 save

echo
echo "============================================"
echo "  pm2-logrotate 配置完成"
echo "============================================"
pm2 show pm2-logrotate | grep -E "(max_size|retain|compress|dateFormat|workerInterval|rotateModule)" || true
echo
echo "下一步: pm2 startup + pm2 save (开机自启), 见 docs/deploy/03-deploy-app.md"
echo "日志路径: $LOG_DIR"
echo "实时查看: pm2 logs"
echo "看历史:   ls -lh $LOG_DIR"
