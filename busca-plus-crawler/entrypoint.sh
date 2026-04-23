#!/bin/sh
set -e

echo "[entrypoint] Waiting for PostgreSQL..."
until pg_isready -h "${DB_HOST:-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-buscaplus}" -q; do
  sleep 2
done
echo "[entrypoint] PostgreSQL is ready."

echo "[entrypoint] Running database migrations..."
npx sequelize-cli db:migrate --env production
echo "[entrypoint] Migrations complete."

exec "$@"
