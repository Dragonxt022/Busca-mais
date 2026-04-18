#!/bin/bash

set +e

echo "=== Limpando ambiente do Busca+ ==="

LEGACY_CONTAINERS=(
  "busca-plus-search-dev"
  "busca-plus-search"
  "busca-plus-worker"
  "busca-plus-crawler"
  "busca-plus-minio"
  "busca-plus-postgres"
  "busca-plus-redis"
  "busca-plus-typesense"
)

LEGACY_VOLUMES=(
  "busca-plus_postgres_data"
  "busca-plus_redis_data"
  "busca-plus_typesense_data"
  "busca-plus_minio_data"
)

docker compose -f docker-compose.dev.yml down -v --remove-orphans

echo "Removendo containers legados..."
for container in "${LEGACY_CONTAINERS[@]}"; do
  docker rm -f "$container" >/dev/null 2>&1
done

echo "Removendo volumes legados..."
for volume in "${LEGACY_VOLUMES[@]}"; do
  docker volume rm "$volume" >/dev/null 2>&1
done

echo "Limpando pastas locais..."
rm -rf images/* screenshots/* 2>/dev/null || true
mkdir -p images screenshots

echo ""
echo "=== Ambiente limpo com sucesso! ==="
echo "Para subir infraestrutura: npm run infra:up"
echo "Para iniciar apps locais: npm run dev"
