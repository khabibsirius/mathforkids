#!/bin/sh
set -e

# The API refuses to start in production with a known example secret — which
# is correct, and which made `docker compose up` fail out of the box until
# this existed. Rather than weakening the check or shipping a default secret
# that everyone shares, generate a real one per container.
#
# Consequence worth knowing: tokens are invalidated when the container is
# recreated, because the secret changes with it. Set JWT_SECRET in .env to keep
# sessions across restarts.
case "${JWT_SECRET:-}" in
  "" | *dev-only* | *change-me* | *please-change*)
    JWT_SECRET="$(node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))")"
    export JWT_SECRET
    echo "› generated a random JWT_SECRET for this container"
    echo "  (set JWT_SECRET in .env to keep sessions across restarts)"
    ;;
  *)
    echo "› using the JWT_SECRET from the environment"
    ;;
esac

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
