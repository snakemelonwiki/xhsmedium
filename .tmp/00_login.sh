#!/bin/bash
# Login all 11 fixture accounts and export tokens
set -e
mkdir -p .tmp
LOGIN() {
  local u=$1
  local p=$2
  local port=$3
  curl -sS -m 5 -X POST "http://localhost:${port}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${u}\",\"password\":\"${p}\"}" \
    | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))"
}

for u in sales01 sales02 academic01 academic02 staff01 staff02 youlun boss01; do
  port=3000
  case "$u" in
    youlun|admin_d) port=3000;;
    boss01) port=3001;;
  esac
  tok=$(LOGIN "$u" test123 $port)
  echo "${u}=${tok}" >> .tmp/tokens.env
  echo "[$u @ $port] ${tok:0:30}..." >&2
done

# Also login ops_c, sales_a, sales_b
for u in ops_c sales_a sales_b admin_d academic02; do
  port=3000
  tok=$(LOGIN "$u" test123 $port)
  echo "${u}=${tok}" >> .tmp/tokens.env
done
echo "All tokens saved to .tmp/tokens.env"
