#!/bin/sh
set -e

echo "› applying migrations"
npx prisma migrate deploy

if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  echo "› seeding (idempotent)"
  node dist/seed.js
else
  echo "› skipping seed (SEED_ON_BOOT=$SEED_ON_BOOT)"
fi

echo "› starting api on :${PORT:-3000}"
exec node dist/main.js
