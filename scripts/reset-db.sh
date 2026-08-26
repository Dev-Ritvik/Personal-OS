#!/usr/bin/env bash
# Reset local dev database to a pristine state (docker Postgres only).
set -euo pipefail
docker exec pos-db-dev psql -U postgres -d pos -c "
TRUNCATE users, sessions, categories, category_history, goals, behaviors,
         tasks, plan_instances, time_entries, measurements, events,
         reflections, metric_snapshots, intervention_log, audit_log, sync_ops
CASCADE;"
echo "database reset"
