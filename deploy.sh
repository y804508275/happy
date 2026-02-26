#\!/bin/bash
set -e

cd /opt/happy-coder

echo "==> Pulling latest code..."
git fetch origin main
git reset --hard origin/main

echo "==> Installing dependencies..."
yarn install --frozen-lockfile 2>/dev/null || yarn install

echo "==> Running database migrations..."
cd packages/happy-server
npx prisma migrate deploy
npx prisma generate
cd ../..

echo "==> Restarting instance 1..."
pm2 restart happy-server-1 --update-env

echo "==> Waiting for instance 1 to be ready..."
sleep 15

if curl -sf http://localhost:3001/ > /dev/null 2>&1; then
    echo "==> Instance 1 healthy"
else
    echo "\!\!\! Instance 1 failed health check, aborting\!"
    exit 1
fi

echo "==> Restarting instance 2..."
pm2 restart happy-server-2 --update-env

echo "==> Waiting for instance 2 to be ready..."
sleep 15

if curl -sf http://localhost:3002/ > /dev/null 2>&1; then
    echo "==> Instance 2 healthy"
else
    echo "\!\!\! Instance 2 failed health check\!"
    exit 1
fi

pm2 save
echo "==> Deploy complete\! Both instances running."
pm2 list
