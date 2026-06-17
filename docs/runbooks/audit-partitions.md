# Runbook: Creating Audit Log Monthly Partitions

The `audit_logs` table uses range partitioning by month. Partitions must exist before
data is inserted — Postgres will reject inserts outside a declared partition range.

## Current partitions (created in migration 20260617000001)

| Partition             | Range                         |
|-----------------------|-------------------------------|
| audit_logs_202606     | 2026-06-01 → 2026-07-01       |
| audit_logs_202607     | 2026-07-01 → 2026-08-01       |
| audit_logs_202608     | 2026-08-01 → 2026-09-01       |
| audit_logs_202609     | 2026-09-01 → 2026-10-01       |

## Creating a new monthly partition

Run the following SQL, replacing `YYYYMM` with the target month:

```sql
CREATE TABLE audit_logs_202610 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
```

## Recommended: Automate with a monthly cron / Atlas migration

Option A — Atlas migration (preferred for tracked history):
```bash
make migrate-new name=add_audit_partition_202610
```
Then add the CREATE TABLE statement to the generated file.

Option B — Direct psql:
```bash
PGPASSWORD=<password> psql -h <host> -U pixs -d pixs_dev -c \
  "CREATE TABLE audit_logs_YYYYMM PARTITION OF audit_logs \
   FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');"
```

## Schedule

Create each partition at least **one week before** the month starts to avoid
rejected inserts during the month boundary. A monthly cron job on the 20th of
each month is a safe schedule.

## Verifying existing partitions

```sql
SELECT
    child.relname AS partition,
    pg_get_expr(child.relpartbound, child.oid) AS bounds
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
WHERE parent.relname = 'audit_logs'
ORDER BY child.relname;
```
