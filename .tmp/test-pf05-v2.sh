#!/bin/bash
extract_token() {
  echo "$1" | grep -oE '"token":"[^"]+"' | head -1 | sed -E 's/"token":"//; s/"$//'
}

LOGIN_BODY=$(curl -s -X POST -H "Content-Type: application/json" -H "X-Server-Port: 3000" -d '{"username":"sales2","password":"test123"}' http://localhost:8089/api/auth/login)
T1=$(extract_token "$LOGIN_BODY")
echo "T1 length: ${#T1}"

echo "===== 1) leads BEFORE logout (expect 200) ====="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "Authorization: Bearer $T1" -H "X-Server-Port: 3000" "http://localhost:8089/api/leads?pageSize=1"

echo "===== 2) logout (expect revoked=true) ====="
curl -s -X POST -H "Authorization: Bearer $T1" -H "X-Server-Port: 3000" "http://localhost:8089/api/auth/logout"
echo

echo "===== 3) leads AFTER logout (expect 401) ====="
curl -s -o /tmp/r3.txt -w "HTTP %{http_code}\n" -H "Authorization: Bearer $T1" -H "X-Server-Port: 3000" "http://localhost:8089/api/leads?pageSize=1"
cat /tmp/r3.txt; echo

echo "===== 4) users AFTER logout (expect 401) ====="
curl -s -o /tmp/r4.txt -w "HTTP %{http_code}\n" -H "Authorization: Bearer $T1" -H "X-Server-Port: 3000" "http://localhost:8089/api/users?limit=1"
cat /tmp/r4.txt; echo

echo "===== 5) re-login + leads (expect 200) ====="
NEW_LOGIN=$(curl -s -X POST -H "Content-Type: application/json" -H "X-Server-Port: 3000" -d '{"username":"sales2","password":"test123"}' http://localhost:8089/api/auth/login)
T2=$(extract_token "$NEW_LOGIN")
echo "T2 length: ${#T2}"
echo "T1==T2? $([ "$T1" = "$T2" ] && echo yes || echo no)"
curl -s -o /tmp/r5.txt -w "HTTP %{http_code}\n" -H "Authorization: Bearer $T2" -H "X-Server-Port: 3000" "http://localhost:8089/api/leads?pageSize=1"

echo "===== 6) OLD T1 token (expect 401) ====="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "Authorization: Bearer $T1" -H "X-Server-Port: 3000" "http://localhost:8089/api/leads?pageSize=1"

echo "===== 7) logout T2 (cleanup) ====="
curl -s -X POST -H "Authorization: Bearer $T2" -H "X-Server-Port: 3000" "http://localhost:8089/api/auth/logout"
echo
