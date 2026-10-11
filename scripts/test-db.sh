#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local Postgres (with a minimal
# Supabase auth shim) and runs the SQL tests in supabase/tests. Needs the
# Postgres binaries (initdb, pg_ctl, psql) on PATH; no Docker required.
set -euo pipefail
# Postgres refuses to start on macOS with an unset/invalid locale ("postmaster became multithreaded").
export LC_ALL=C LANG=C

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PGTEST_PORT:-54329}"
DATA="$(mktemp -d)"
LOG="$DATA/postgres.log"

cleanup() { pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

initdb -D "$DATA" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null
# TCP on localhost only: temp-dir paths can exceed the 103-byte Unix socket limit.
pg_ctl -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$LOG" -w start >/dev/null \
  || { cat "$LOG"; exit 1; }

PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/supabase/tests/auth-shim.sql"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$migration")"
  "${PSQL[@]}" -f "$migration"
done
for test in "$ROOT"/supabase/tests/*.test.sql; do
  echo "test: $(basename "$test")"
  "${PSQL[@]}" -f "$test"
done
