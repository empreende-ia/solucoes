#!/usr/bin/env bash
set -euo pipefail
# Runs the full fresh migration chain and real RLS checks in a disposable local PostgreSQL cluster.
crm_test_dir=$(mktemp -d /tmp/empreende-crm-database.XXXXXX)
crm_test_port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
cleanup() { pg_ctl -D "$crm_test_dir/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$crm_test_dir"; }
trap cleanup EXIT
initdb -D "$crm_test_dir/data" -A trust -U postgres --encoding=UTF8 --no-locale >"$crm_test_dir/init.log"
pg_ctl -D "$crm_test_dir/data" -l "$crm_test_dir/server.log" -o "-p $crm_test_port -h 127.0.0.1 -k $crm_test_dir" start >/dev/null
crm_psql=(psql -X -h 127.0.0.1 -p "$crm_test_port" -U postgres -d postgres -v ON_ERROR_STOP=1)
"${crm_psql[@]}" -f supabase/tests/local-bootstrap.sql >/dev/null
for migration in supabase/migrations/*.sql; do "${crm_psql[@]}" -f "$migration" >/dev/null; done
"${crm_psql[@]}" -f supabase/tests/commercial-security.sql
