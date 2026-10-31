# FitPass migration review notes

## Current staged sequence

1. `0000_live_schema_baseline.sql` is a no-op marker for the five pre-existing
   business tables. It does not create them. Its snapshot describes the
   previously inspected source schema, not an independently restored backup.
2. `0001_fitpass_multitenant_foundation.sql` creates the additive auth, gym,
   membership, package, billing, invitation, and audit tables, then adds
   nullable tenant columns to the five existing business tables. It retains
   all existing constraints and indexes.
3. `0002_backfill_initial_gym.sql` asserts the four owner-confirmed plan IDs
   and names, creates or reuses the approved launch gym, fills only new tenant
   fields, and then enforces non-nullability and the 1–20 daily check-in limit.
   It does not change plan IDs or existing plan values/timestamps.
4. `0003_tenant_constraints.sql` validates tenant-scoped uniqueness and
   same-gym foreign keys before removing the replaced global constraints.
   The legacy `checkins.checked_in_by -> members.id` foreign key stays in place.
5. `0004_launch_gym_content.sql` adds JSON array columns for amenities and
   equipment and writes the agreed demo content and local SVG paths only for
   the confirmed launch gym. It does not touch membership plans.

Drizzle Kit 0.31.11's PostgreSQL migrator reads the SQL files and journal and
records each migration hash/timestamp in its configured migration table. The
migrator itself wraps a migration in a transaction. The `generate` command is
schema/snapshot driven and is not a database inspection tool. Its invocation
failed in this Windows environment with `uv_os_get_passwd returned ENOMEM`,
so these hand-reviewed SQL files have not been generated or rehearsed by
Drizzle Kit. Do not use `generate`, `push`, or `migrate` until the local backup
restore and schema comparison are complete and approved. In particular, do
not treat the old `0001_snapshot.json` as proof of an intermediate stage.

## Safety gates before any rehearsal

- Restore the independently created custom-format backup into a new disposable
  local PostgreSQL database; never target Neon.
- Compare actual tables, columns, constraints, and indexes with
  `0000_snapshot.json`. Stop if the baseline differs.
- Compare the four plan rows by ID and all source fields before and after the
  backfill. The migration guards IDs and names but cannot prove prices,
  descriptions, order, active flags, or timestamps without the restored
  source comparison.
- Inspect `public.__drizzle_migrations` on the disposable database before each
  attempt. Drizzle hashes and journal timestamps identify completed migrations;
  do not manually replay a partially applied file. Each phase is transactional,
  so an error must roll back the phase. Restore a new disposable copy for a
  clean retry.
- Rehearse only against the restored copy, verify records/foreign keys/indexes,
  and test recovery before a separately approved production change.

## Rollback and recovery

These phases are forward-only once application writes can use tenant columns.
Do not attempt an in-place reverse migration that nulls tenant ownership or
removes historical actor/payment attribution. For rehearsal failures, discard
only the disposable target and restore the immutable backup to a new disposable
database. For any future production incident, stop writes and use the separately
approved Neon recovery procedure; do not replace the existing Neon snapshot.
