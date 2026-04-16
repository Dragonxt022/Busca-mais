#!/bin/bash

# Script de inicialização do Busca+
# Este script inicia todos os serviços necessários

echo "🚀 Iniciando Busca+..."

# Verificar se o Docker está instalado
if ! command -v docker &> /dev/null; then
    echo "❌ Docker não está instalado. Por favor, instale o Docker primeiro."
    exit 1
fi

# Verificar se o Docker Compose está instalado
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose não está instalado. Por favor, instale o Docker Compose primeiro."
    exit 1
fi

# Parar containers existentes
echo "📦 Parando containers existentes..."
docker-compose down

# Construir e iniciar containers
echo "🔨 Construindo e iniciando containers..."
docker-compose up --build -d

# Aguardar serviços ficarem prontos
echo "⏳ Aguardando serviços iniciarem..."
sleep 10

# Verificar se os serviços estão rodando
echo "✅ Verificando status dos serviços..."
docker-compose ps

echo ""
echo "🎉 Busca+ iniciado com sucesso!"
echo ""
echo "📊 Serviços disponíveis:"
echo "   - Crawler API: http://localhost:3000"
echo "   - Search UI: http://localhost:3001"
echo "   - Typesense: http://localhost:8108"
echo "   - Redis: localhost:6379"
echo "   - PostgreSQL: localhost:5432"
echo ""
echo "📖 Para visualizar os logs, execute:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Para parar os serviços, execute:"
echo "   docker-compose down"