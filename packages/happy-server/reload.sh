#!/bin/bash
# Rolling restart: reload one instance at a time to avoid downtime
# nginx fail_timeout=3s, so we wait 5s between reloads to ensure recovery
set -e

echo "=== Rolling restart of happy-server ==="

echo "[1/4] Reloading happy-server-1..."
pm2 reload happy-server-1
echo "[2/4] Waiting for happy-server-1 to be ready..."
sleep 5

# Verify server-1 is responding
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3001/v1/sessions" 2>/dev/null)
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "    happy-server-1 is healthy (HTTP $HTTP_CODE)"
else
    echo "    WARNING: happy-server-1 returned HTTP $HTTP_CODE, waiting 5 more seconds..."
    sleep 5
fi

echo "[3/4] Reloading happy-server-2..."
pm2 reload happy-server-2
echo "[4/4] Waiting for happy-server-2 to be ready..."
sleep 5

# Verify server-2 is responding
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3002/v1/sessions" 2>/dev/null)
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "    happy-server-2 is healthy (HTTP $HTTP_CODE)"
else
    echo "    WARNING: happy-server-2 returned HTTP $HTTP_CODE, waiting 5 more seconds..."
    sleep 5
fi

echo ""
echo "=== Rolling restart complete ==="
pm2 status
