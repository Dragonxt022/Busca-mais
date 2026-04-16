#!/bin/bash

echo "=== Limpando dados do Busca+ ==="

# Parar containers
echo "Parando containers..."
docker-compose down

# Remover volumes de dados
echo "Removendo volumes de dados..."
docker volume rm busca-plus_postgres_data busca-plus_redis_data busca-plus_typesense_data 2>/dev/null || true

# Limpar pastas de imagens e screenshots
echo "Limpando pastas..."
rm -rf images/* screenshots/* 2>/dev/null || true

# Recriar pastas
mkdir -p images

echo "=== Dados limpos com sucesso! ==="
echo ""
echo "Para reiniciar:"
echo "  docker-compose up -d"
echo ""
echo "Depois inicialize o Typesense:"
echo "  docker-compose exec crawler node src/scripts/init-typesense.js"
