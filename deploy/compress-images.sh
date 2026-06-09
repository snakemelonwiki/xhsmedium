#!/usr/bin/env bash
# compress-images.sh — 批量压缩目录下图片，原图备份为 .orig.ext
#
# 用法:
#   bash deploy/compress-images.sh /path/to/images
#   bash deploy/comploy-images.sh /path/to/images --quality 3
#   bash deploy/compress-images.sh /path/to/images --dry-run
#
# 效果:
#   photo.jpg  → 压缩后 photo.jpg（覆盖）
#   原图备份   → photo.orig.jpg
#
# 依赖: ffmpeg

set -euo pipefail

QUALITY=5        # -q:v 值，2=最好，31=最差
DRY_RUN=false
TARGET_DIR="${1:-.}"

# 解析参数
shift || true
for arg in "$@"; do
  case "$arg" in
    --quality=*) QUALITY="${arg#*=}" ;;
    --quality)   shift; QUALITY="${1:-5}" ;;
    --dry-run)   DRY_RUN=true ;;
  esac
done

if ! command -v ffmpeg &> /dev/null; then
  echo "✗ 需要 ffmpeg，请先安装: sudo apt install ffmpeg"
  exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
  echo "✗ 目录不存在: $TARGET_DIR"
  exit 1
fi

cd "$TARGET_DIR"

count=0
skipped=0

for f in *.jpg *.jpeg *.png *.webp *.JPG *.JPEG *.PNG *.WEBP; do
  [ -f "$f" ] || continue

  # 跳过已备份的文件
  if [[ "$f" == *.orig.* ]]; then
    continue
  fi

  ext="${f##*.}"
  base="${f%.*}"
  backup="${base}.orig.${ext}"

  # 已有备份则跳过
  if [ -f "$backup" ]; then
    echo "[skip] $f（已有备份 $backup）"
    skipped=$((skipped + 1))
    continue
  fi

  # 获取压缩前大小
  orig_size=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)

  if $DRY_RUN; then
    echo "[dry-run] $f (${orig_size} bytes) → $backup + $f (compressed q:$QUALITY)"
  else
    # 备份原图
    mv "$f" "$backup"
    # 压缩
    ffmpeg -y -i "$backup" -q:v "$QUALITY" "$f" 2>/dev/null
    # 获取压缩后大小
    new_size=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)
    saved=$(( (orig_size - new_size) * 100 / (orig_size > 0 ? orig_size : 1) ))
    echo "[ok] $f: ${orig_size} → ${new_size} bytes (节省 ${saved}%)"
  fi

  count=$((count + 1))
done

echo ""
echo "完成: 处理 $count 张，跳过 $skipped 张"
