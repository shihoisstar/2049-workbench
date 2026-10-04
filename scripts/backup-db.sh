#!/usr/bin/env bash
# 数据库备份(T3.3/INF-09):本地演练与生产脚本同构。
# 用法:./scripts/backup-db.sh [输出目录,默认 backups/]
# 纪律:输出含业务数据,不得入 git(backups/ 已在 .gitignore)。
set -euo pipefail
OUT_DIR="${1:-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"
docker exec infra-postgres-1 pg_dump -U wb -d workbench > "$OUT_DIR/workbench-$STAMP.sql"
echo "backup: $OUT_DIR/workbench-$STAMP.sql ($(wc -c < "$OUT_DIR/workbench-$STAMP.sql") bytes)"
