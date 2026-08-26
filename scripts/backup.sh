#!/usr/bin/env bash
# POS backup — REAL local dump; offsite upload ONLY when you configure it.
#
# What this DOES:
#   * pg_dump (custom format) of DATABASE_URL to ./backups/pos-<UTCSTAMP>.dump
#   * prunes local dumps older than RETAIN_DAYS (default 14)
#
# What this DOES NOT do by itself:
#   * offsite storage. Set BACKUP_UPLOAD_CMD to a command that receives the
#     dump path as its last argument, e.g.:
#       BACKUP_UPLOAD_CMD='rclone copy {} remote:pos-backups'
#       BACKUP_UPLOAD_CMD='aws s3 cp {} s3://my-bucket/pos/'
#     The script substitutes {} with the dump path and executes it.
#
# Supabase note: DATABASE_URL must be the direct (non-pgbouncer) connection or
# a role allowed to pg_dump. Managed PITR/scheduled backups remain the
# provider's responsibility — configure them in addition to this.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/pos-$STAMP.dump"

mkdir -p "$BACKUP_DIR"
echo "[backup] dumping $DATABASE_URL -> $OUT"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges -f "$OUT"
echo "[backup] wrote $(du -h "$OUT" | cut -f1) -> $OUT"

if [[ -n "${BACKUP_UPLOAD_CMD:-}" ]]; then
  echo "[backup] uploading via BACKUP_UPLOAD_CMD"
  # shellcheck disable=SC2086
  ${BACKUP_UPLOAD_CMD/\{\}/\"$OUT\"}
else
  echo "[backup] NOTE: no BACKUP_UPLOAD_CMD configured — dump is LOCAL ONLY."
fi

find "$BACKUP_DIR" -name 'pos-*.dump' -type f -mtime "+$RETAIN_DAYS" -print -delete || true
echo "[backup] done"
