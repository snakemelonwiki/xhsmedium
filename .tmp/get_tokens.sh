#!/bin/bash
set -e
BASE="http://localhost:8089"
OUT="D:/pycharmProjects/xhsmedium_github/.tmp/tokens.json"

declare -A USERS=(
  ["sales01"]="sales"
  ["sales1"]="sales"
  ["academic01"]="academic"
  ["academic02"]="academic"
  ["staff1"]="staff"
  ["staff01"]="staff"
  ["operation1"]="operation"
  ["youlun"]="admin"
  ["boss01"]="owner"
)

echo "{"
FIRST=1
for u in "${!USERS[@]}"; do
  role="${USERS[$u]}"
  resp=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"$u\",\"password\":\"test123\"}")
  token=$(echo "$resp" | python -c "import json,sys; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
  legacyToken=$(echo "$resp" | python -c "import json,sys; d=json.load(sys.stdin); print(d.get('legacyToken',''))" 2>/dev/null)
  userId=$(echo "$resp" | python -c "import json,sys; d=json.load(sys.stdin); print(d.get('user',{}).get('id',''))" 2>/dev/null)
  if [ -z "$token" ]; then
    echo "WARN: failed to login $u"
    continue
  fi
  if [ $FIRST -eq 0 ]; then echo ","; fi
  FIRST=0
  printf '"%s":{"role":"%s","token":"%s","legacyToken":"%s","userId":"%s"}' "$u" "$role" "$token" "$legacyToken" "$userId"
done
echo ""
echo "}"
