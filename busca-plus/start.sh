#!/bin/bash

echo "Iniciando infraestrutura do Busca+..."

if ! command -v docker &> /dev/null; then
    echo "Docker nao esta instalado."
    exit 1
fi

docker compose -f docker-compose.dev.yml up -d

echo "Aguardando servicos iniciarem..."
sleep 10

docker compose -f docker-compose.dev.yml ps

echo ""
echo "Infraestrutura iniciada com sucesso."
echo "  PostgreSQL: localhost:5432"
echo "  Redis: localhost:6379"
echo "  Typesense: http://localhost:8108"
echo "  Apps locais: execute 'npm run dev' em ./busca-plus"
