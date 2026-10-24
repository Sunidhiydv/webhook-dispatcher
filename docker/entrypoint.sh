#!/bin/sh
set -eu

if [ "${1:-api}" = "worker" ]; then
  exec node dist/worker.js
fi

npx prisma migrate deploy
exec node dist/server.js
