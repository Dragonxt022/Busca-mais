#!/bin/bash
# =============================================================
# Busca+ — Script de Deploy para VPS
#
# Uso:
#   chmod +x deploy.sh
#
#   Primeiro deploy:  ./deploy.sh install
#   Atualizar:        ./deploy.sh update
#   Ver logs:         ./deploy.sh logs
#   Parar:            ./deploy.sh stop
#   Reiniciar:        ./deploy.sh restart
#   Status:           ./deploy.sh status
# =============================================================

set -e

COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

check_deps() {
    command -v docker >/dev/null 2>&1   || error "Docker não encontrado. Instale: https://docs.docker.com/engine/install/"
    docker compose version >/dev/null 2>&1 || error "Docker Compose plugin não encontrado."
    info "Dependências OK."
}

check_env() {
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            warn ".env não encontrado. Copiando .env.example para .env..."
            cp .env.example .env
            warn "ATENÇÃO: edite o arquivo .env e defina senhas seguras antes de continuar!"
            warn "  nano .env"
            exit 1
        else
            error ".env não encontrado e .env.example também não existe."
        fi
    fi

    # Valida variáveis obrigatórias
    source .env 2>/dev/null || true
    [ -z "$POSTGRES_PASSWORD" ] && error "POSTGRES_PASSWORD não definido no .env"
    [ -z "$TYPESENSE_API_KEY" ]  && error "TYPESENSE_API_KEY não definido no .env"

    if echo "$POSTGRES_PASSWORD" | grep -q "TROQUE"; then
        error "POSTGRES_PASSWORD ainda tem valor padrão. Defina uma senha segura no .env."
    fi
    if echo "$TYPESENSE_API_KEY" | grep -q "TROQUE"; then
        error "TYPESENSE_API_KEY ainda tem valor padrão. Gere uma chave com: openssl rand -hex 32"
    fi

    info ".env validado."
}

build() {
    info "Construindo imagens Docker..."
    docker compose -f "$COMPOSE_FILE" build --no-cache crawler search
    info "Build concluído."
}

start_infra() {
    info "Iniciando infraestrutura (postgres, redis, typesense)..."
    docker compose -f "$COMPOSE_FILE" up -d postgres redis typesense

    info "Aguardando serviços de infraestrutura ficarem saudáveis..."
    timeout=120
    elapsed=0
    while ! docker compose -f "$COMPOSE_FILE" ps postgres | grep -q "healthy"; do
        sleep 3; elapsed=$((elapsed+3))
        [ $elapsed -ge $timeout ] && error "Timeout aguardando PostgreSQL."
    done
    info "Infraestrutura pronta."
}

init_typesense() {
    info "Inicializando coleções do Typesense..."
    docker compose -f "$COMPOSE_FILE" run --rm \
        -e NODE_ENV=production \
        crawler node src/scripts/init-typesense.js \
        && info "Typesense inicializado." \
        || warn "init-typesense falhou ou já estava inicializado (ignorando)."
}

start_all() {
    info "Iniciando todos os serviços..."
    docker compose -f "$COMPOSE_FILE" up -d
    info "Todos os serviços iniciados."
}

cmd_install() {
    info "=== PRIMEIRO DEPLOY ==="
    check_deps
    check_env
    build
    start_infra
    init_typesense
    start_all
    info "=== Deploy concluído! ==="
    echo ""
    echo "  Busca pública:  http://seudominio.com.br"
    echo "  Painel Admin:   http://admin.seudominio.com.br"
    echo ""
    echo "  Próximos passos:"
    echo "  1. Configure o DNS dos seus domínios para apontar para este servidor."
    echo "  2. Instale SSL com Certbot:"
    echo "     certbot --nginx -d seudominio.com.br -d admin.seudominio.com.br"
}

cmd_update() {
    info "=== ATUALIZAÇÃO ==="
    check_deps
    check_env
    info "Puxando código mais recente..."
    git pull origin main
    build
    info "Recriando serviços com nova imagem..."
    docker compose -f "$COMPOSE_FILE" up -d --no-deps crawler worker search
    info "=== Atualização concluída! ==="
}

cmd_logs() {
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100 "${2:-}"
}

cmd_stop() {
    info "Parando todos os serviços..."
    docker compose -f "$COMPOSE_FILE" down
    info "Serviços parados."
}

cmd_restart() {
    info "Reiniciando serviços de aplicação..."
    docker compose -f "$COMPOSE_FILE" restart crawler worker search nginx
    info "Reiniciado."
}

cmd_status() {
    docker compose -f "$COMPOSE_FILE" ps
}

case "${1:-help}" in
    install) cmd_install ;;
    update)  cmd_update  ;;
    logs)    cmd_logs    ;;
    stop)    cmd_stop    ;;
    restart) cmd_restart ;;
    status)  cmd_status  ;;
    *)
        echo "Uso: $0 {install|update|logs|stop|restart|status}"
        exit 1
        ;;
esac
