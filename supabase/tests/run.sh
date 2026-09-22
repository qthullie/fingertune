#!/bin/sh
# Applies both migrations to a throwaway database and runs the policy checks.
#
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres sh supabase/tests/run.sh
#
# Needs a Postgres you can create databases on. Drops and recreates
# `fingertune_test` and touches nothing else. Exits non-zero on any FAIL.
set -e
cd "$(dirname "$0")"
DB=fingertune_test
PSQL="psql -X -q -w -v ON_ERROR_STOP=1"

$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d $DB -f stub.sql
$PSQL -d $DB -f ../migrations/0001_scores.sql
# One row under 0001's rules, so the check can prove 0002 clears it.
$PSQL -d $DB -c "insert into public.scores (beatmap, name, score, accuracy, max_combo)
                 values ('first-steps', 'legacy', 100, 50, 1)"
$PSQL -d $DB -f ../migrations/0002_players.sql
# Twice: a migration someone reruns by accident must not fail or change anything.
$PSQL -d $DB -f ../migrations/0002_players.sql

out=$(psql -X -q -w -d $DB -f policies.sql 2>&1)
echo "$out" | grep -E '^(---|PASS|FAIL)'
pass=$(echo "$out" | grep -c '^PASS' || true)
fail=$(echo "$out" | grep -c '^FAIL' || true)
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] && [ "$pass" -gt 0 ]
