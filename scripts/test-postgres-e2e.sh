#!/bin/bash
# =============================================================================
# E2E TEST: the full Postgres deployment path, executed locally
#   1. Start a REAL PostgreSQL server (embedded binaries, no sudo needed)
#   2. Run the actual migration script (db:to-postgres) — schema push + 17 tables
#   3. Boot the PRODUCTION standalone Next.js server against Postgres
#   4. Verify reads (catalog) AND writes (demo login -> create list) on Postgres
#   5. Verify data directly in Postgres via psql, then tear down
# =============================================================================
set -uo pipefail

ROOT=/home/z/my-project
BIN=$ROOT/node_modules/@embedded-postgres/linux-x64/native/bin
# Postgres 18.4 binaries link ICU 60 (system has ICU 76) — real ICU 60 libs are
# extracted from the Debian archive next to the shim symlinks (no root needed)
export LD_LIBRARY_PATH=$ROOT/.pgtest-shim/icu-shim
PGDATA=$ROOT/.pgtest/data
PGPORT=5433
PGURL="postgres://postgres@127.0.0.1:5433/grocery_test"
TESTPORT=3200
SRV_PID=""
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "  PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL  $1"; }
check(){ local label="$1" want="$2" got="$3"; if [ "$got" = "$want" ]; then ok "$label"; else bad "$label (want=$want got=$got)"; fi }

cleanup() {
  echo ""
  echo "=== Tear down ==="
  [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null && echo "  standalone server stopped"
  "$BIN/pg_ctl" -D "$PGDATA" stop -m fast >/dev/null 2>&1 && echo "  postgres stopped"
  # restore sqlite for local dev (the PG build above flips the schema)
  cd "$ROOT" && node scripts/sync-prisma-provider.mjs >/dev/null 2>&1 \
    && "$ROOT/node_modules/.bin/prisma" generate >/dev/null 2>&1 \
    && echo "  local schema restored to sqlite"
}
trap cleanup EXIT

echo "=== 1. Start real PostgreSQL (embedded binaries) ==="
rm -rf "$ROOT/.pgtest"
mkdir -p "$ROOT/.pgtest"
"$BIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null 2>&1 \
  && ok "initdb complete" || { bad "initdb"; exit 1; }
"$BIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -c listen_addresses=127.0.0.1 -k /tmp" \
  -l "$ROOT/.pgtest/postgres.log" start >/dev/null 2>&1
READY=0
for i in $(seq 1 20); do
  (echo > /dev/tcp/127.0.0.1/$PGPORT) 2>/dev/null && READY=1 && break
  sleep 0.5
done
[ "$READY" = "1" ] && ok "postgres ready on :$PGPORT" || { bad "postgres start"; exit 1; }
cd "$ROOT" && bun -e "
import pg from 'pg';
const c = new pg.Client({connectionString: 'postgres://postgres@127.0.0.1:$PGPORT/postgres'});
await c.connect();
await c.query('CREATE DATABASE grocery_test');
console.log('  PASS  database grocery_test created');
await c.end();
" || { bad "createdb"; exit 1; }

echo ""
echo "=== 2. Run the real migration (bun run db:to-postgres) ==="
cd "$ROOT"
bun scripts/migrate-sqlite-to-postgres.mjs --url "$PGURL" 2>&1 | grep -vE "^$|prisma notice|Data proxy" | tail -30
MIG_EXIT=${PIPESTATUS[0]}
check "migration exit code" 0 "$MIG_EXIT"
[ "$MIG_EXIT" != "0" ] && exit 1
grep -q 'provider = "sqlite"' prisma/schema.prisma && ok "local schema restored to sqlite" || bad "schema restore"

echo ""
echo "=== 3. Build production bundle against Postgres (what the cloud build does) ==="
cd "$ROOT"
DATABASE_URL="$PGURL" bun run build > "$ROOT/.pgtest/build.log" 2>&1
BUILD_EXIT=$?
check "cloud-equivalent build with postgres client" 0 "$BUILD_EXIT"
[ "$BUILD_EXIT" != "0" ] && { tail -20 "$ROOT/.pgtest/build.log"; exit 1; }
grep -q 'provider = "postgresql"' prisma/schema.prisma && ok "schema compiled as postgresql" || bad "schema provider"
grep -qE "Generated Prisma Client" "$ROOT/.pgtest/build.log" && ok "prisma client regenerated during build" || bad "client generate"

echo ""
echo "=== 4. Boot PRODUCTION standalone server against Postgres ==="
cd "$ROOT/.next/standalone"
DATABASE_URL="$PGURL" PORT=$TESTPORT node server.js > "$ROOT/.pgtest/server.log" 2>&1 &
SRV_PID=$!
for i in $(seq 1 30); do
  curl -sf -o /dev/null "http://127.0.0.1:$TESTPORT/" && break
  sleep 1
done
curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$TESTPORT/" | grep -q 200 && ok "server up on :$TESTPORT" || { bad "server boot"; exit 1; }

echo ""
echo "=== 5. API tests (reads from Postgres) ==="
STORES=$(curl -s "http://127.0.0.1:$TESTPORT/api/stores" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['stores']))" 2>/dev/null)
check "GET /api/stores -> 7 SA stores" 7 "$STORES"

PROMOS=$(curl -s "http://127.0.0.1:$TESTPORT/api/promos" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['promos']))" 2>/dev/null)
[ -n "$PROMOS" ] && [ "$PROMOS" -gt 0 ] 2>/dev/null && ok "GET /api/promos -> $PROMOS cards" || bad "GET /api/promos"

PRODUCTS=$(curl -s "http://127.0.0.1:$TESTPORT/api/products" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('results', d.get('products', d.get('items', [])))))" 2>/dev/null)
[ -n "$PRODUCTS" ] && [ "$PRODUCTS" -gt 0 ] 2>/dev/null && ok "GET /api/products -> $PRODUCTS products" || bad "GET /api/products"

WHATSNEW=$(curl -s "http://127.0.0.1:$TESTPORT/api/whats-new" -o /dev/null -w "%{http_code}")
check "GET /api/whats-new" 200 "$WHATSNEW"

echo ""
echo "=== 6. API tests (WRITES persisted to Postgres) ==="
COOKIE=$(mktemp)
LOGIN=$(curl -s -c "$COOKIE" -X POST "http://127.0.0.1:$TESTPORT/api/auth/google" \
  -H "Content-Type: application/json" \
  -d '{"email":"pg-e2e-test@example.com","name":"PG E2E Tester"}' -o /dev/null -w "%{http_code}")
check "demo login (user upsert on PG)" 200 "$LOGIN"

CREATE=$(curl -s -b "$COOKIE" -X POST "http://127.0.0.1:$TESTPORT/api/lists" \
  -H "Content-Type: application/json" -d '{"name":"PG E2E Test List"}')
LIST_ID=$(echo "$CREATE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('list',{}).get('id',''))" 2>/dev/null)
[ -n "$LIST_ID" ] && ok "POST /api/lists -> created $LIST_ID" || bad "POST /api/lists ($CREATE)"

COUNT=$(curl -s -b "$COOKIE" "http://127.0.0.1:$TESTPORT/api/lists" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['lists']))" 2>/dev/null)
check "GET /api/lists -> 1 list" 1 "$COUNT"
rm -f "$COOKIE"

echo ""
echo "=== 7. Verify directly inside Postgres (raw SQL via pg) ==="
cd "$ROOT" && bun -e "
import pg from 'pg';
const c = new pg.Client({connectionString: '$PGURL'});
await c.connect();
const tables = ['Store','Product','StorePrice','Promotion','ShoppingList','User'];
let fails = 0;
for (const t of tables) {
  const r = await c.query('SELECT COUNT(*)::int AS n FROM \"' + t + '\"');
  if (r.rows[0].n > 0) { console.log('  PASS  ' + t + ': ' + r.rows[0].n + ' rows in Postgres'); }
  else { console.log('  FAIL  ' + t + ' empty'); fails++; }
}
const l = await c.query(\"SELECT name FROM \\\"ShoppingList\\\" WHERE id='$LIST_ID'\");
if (l.rows[0]?.name === 'PG E2E Test List') console.log('  PASS  created list readable in raw SQL');
else { console.log('  FAIL  created list not found in raw SQL'); fails++; }
const u = await c.query(\"SELECT email FROM \\\"User\\\" WHERE email='pg-e2e-test@example.com'\");
if (u.rows[0]?.email === 'pg-e2e-test@example.com') console.log('  PASS  upserted user readable in raw SQL');
else { console.log('  FAIL  upserted user not found'); fails++; }
await c.end();
process.exit(fails);
"
SQL_EXIT=$?
if [ "$SQL_EXIT" = "0" ]; then PASS=$((PASS+8)); else FAIL=$((FAIL+SQL_EXIT)); fi

echo ""
echo "==============================================="
echo "  RESULT: $PASS passed, $FAIL failed"
echo "==============================================="
[ "$FAIL" = "0" ]
