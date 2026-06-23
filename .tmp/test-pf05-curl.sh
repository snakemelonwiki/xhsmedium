#!/bin/bash
set -e

LOGIN_BODY=$(curl -s -X POST -H "Content-Type: application/json" -H "X-Server-Port: 3000" -d '{"username":"sales2","password":"test123"}' http://localhost:8089/api/auth/login)
echo "LOGIN RESPONSE: $LOGIN_BODY"
TOKEN=$(echo "$LOGIN_BODY" | python -c "import json,sys; print(json.load(sys.stdin).get('token'))")
echo "TOKEN length: ${#TOKEN}"

echo "===== 1) leads BEFORE logout (expect 200) ====="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" -H "X-Server-Port: 3000" "http://localhost:8089/api/leads?pageSize=1"

echo "===== 2) logout (expect 201, revoked=true) ====="
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "X-Server-Port: 3000" "http://localhost:8089/api/auth/logout"
echo

echo "===== 3) leads AFTER logout (expect 401) ====="
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" -H "X-Server-Port: 3000" "http://localhost:8089/api/leads?pageSize=1"

echo "===== 4) users AFTER logout (expect 401) ====="
curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" -H "X-Server-Port: 3000" "http://localhost:8089/api/users?limit=1"

echo "===== 5) re-login + leads (expect 200) ====="
NEW_LOGIN=$(curl -s -X POST -H "Content-Type: application/json" -H "X-Server-Port: 3000" -d '{"username":"sales2","password":"test123"}' http://localhost:8089/api/auth/login)
NEW_TOKEN=$(echo "$NEW_LOGIN" | python -c "import json,sys; print(json.load(sys.stdin).get('token'))")
echo "NEW TOKEN length: ${#NEW_TOKEN}"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "Authorization: Bearer $NEW_TOKEN" -H "X-Server-Port: 3000" "http://localhost:8089/api/leads?pageSize=1"

echo "===== 6) OLD token again (expect 401 still) ====="
curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" -H "X-Server-Port: 3000" "http://localhost:8089/api/leads?pageSize=1"
