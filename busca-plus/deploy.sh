#!/bin/bash
# =============================================================
# Busca+ — Deploy automatizado (stack Docker completa)
#
# Uso:
#   chmod +x deploy.sh
#
#   Primeiro deploy:  ./deploy.sh install
#   Atualizar:        ./deploy.sh update
#   Status:           ./deploy.sh status
#   Logs:             ./deploy.sh logs [crawler|search|worker|postgres|redis|typesense]
#   Reiniciar apps:   ./deploy.sh restart
#   Parar tudo:       ./deploy.sh stop
# =============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"

cd "$PROJECT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
step()  { echo -e "\n${GREEN}▶ $1${NC}"; }

# ── Verificar dependências ────────────────────────────────────
check_deps() {
    step "Verificando dependências"

    command -v docker >/dev/null 2>&1 \
        || error "Docker não encontrado. Instale em: https://docs.docker.com/engine/install/"

    docker compose version >/dev/null 2>&1 \
        || error "Docker Compose plugin não encontrado. Execute:\n  mkdir -p ~/.docker/cli-plugins && curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose && chmod +x ~/.docker/cli-plugins/docker-compose"

    info "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
    info "Docker Compose $(docker compose version --short)"
}

# ── Validar .env ──────────────────────────────────────────────
check_env() {
    step "Validando .env"

    if [ ! -f ".env" ]; then
        [ -f ".env.example" ] || error ".env não encontrado."
        cp .env.example .env
        warn ".env criado a partir do .env.example"
        warn "Edite o arquivo antes de continuar: nano .env"
        exit 1
    fi

    set -a; source .env; set +a

    [ -z "$POSTGRES_PASSWORD" ] && error "POSTGRES_PASSWORD não definido no .env"
    [ -z "$TYPESENSE_API_KEY" ]  && error "TYPESENSE_API_KEY não definido no .env"

    echo "$POSTGRES_PASSWORD" | grep -q "TROQUE" \
        && error "POSTGRES_PASSWORD ainda é o valor padrão. Defina uma senha real."
    echo "$TYPESENSE_API_KEY" | grep -q "TROQUE" \
        && error "TYPESENSE_API_KEY ainda é o valor padrão. Gere com: openssl rand -hex 32"

    info ".env OK"
}

# ── Build das imagens ─────────────────────────────────────────
build_images() {
    step "Fazendo build das imagens Docker"
    docker compose -f "$COMPOSE_FILE" build --no-cache
    info "Build concluído"
}

# ── Subir toda a stack ────────────────────────────────────────
start_stack() {
    step "Iniciando todos os serviços"
    docker compose -f "$COMPOSE_FILE" up -d

    info "Aguardando PostgreSQL ficar pronto..."
    timeout=120; elapsed=0
    until docker compose -f "$COMPOSE_FILE" exec -T postgres \
        pg_isready -U "${POSTGRES_USER:-buscaplus}" -q 2>/dev/null; do
        sleep 3; elapsed=$((elapsed+3))
        [ $elapsed -ge $timeout ] && error "Timeout aguardando PostgreSQL."
    done

    info "Serviços iniciados"
}

# ── Reiniciar só as apps (não a infra) ───────────────────────
restart_apps() {
    step "Recriando containers das aplicações"
    docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate crawler worker search
    info "Apps reiniciados"
}

# ──────────────────────────────────────────────────────────────
# Comandos
# ──────────────────────────────────────────────────────────────

cmd_install() {
    info "════════════════════════════════════"
    info "       PRIMEIRO DEPLOY — Busca+     "
    info "════════════════════════════════════"
    check_deps
    check_env
    build_images
    start_stack
    echo ""
    info "════════ Deploy concluído! ════════"
    echo ""
    echo "  Busca pública : https://buscamais.cipilimitada.com.br   (porta 3002)"
    echo "  Painel Admin  : https://admin.buscamais.cipilimitada.com.br (porta 3001)"
    echo ""
    echo "  ./deploy.sh status   → ver containers"
    echo "  ./deploy.sh logs     → ver logs em tempo real"
    echo "  ./deploy.sh update   → atualizar após git push"
    echo ""
}

cmd_update() {
    info "════════════════════════════════════"
    info "           ATUALIZAÇÃO              "
    info "════════════════════════════════════"
    check_deps
    check_env
    info "Puxando código mais recente..."
    git pull origin main
    build_images
    start_stack
    restart_apps
    info "════════ Atualização concluída! ════════"
}

cmd_logs() {
    local service="${2:-}"
    if [ -n "$service" ]; then
        docker compose -f "$COMPOSE_FILE" logs -f --tail=100 "$service"
    else
        docker compose -f "$COMPOSE_FILE" logs -f --tail=100
    fi
}

cmd_stop() {
    step "Parando toda a stack"
    docker compose -f "$COMPOSE_FILE" down
    info "Tudo parado."
}

cmd_restart() {
    check_env
    restart_apps
}

cmd_status() {
    echo ""
    info "── Containers ──"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    info "── Portas publicadas ──"
    docker ps --format "table {{.Names}}\t{{.Ports}}" | grep busca
}

# ── Roteador de comandos ──────────────────────────────────────
case "${1:-help}" in
    install) cmd_install       ;;
    update)  cmd_update        ;;
    logs)    cmd_logs "$@"     ;;
    stop)    cmd_stop          ;;
    restart) cmd_restart       ;;
    status)  cmd_status        ;;
    *)
        echo ""
        echo "Uso: $0 {install|update|logs|stop|restart|status}"
        echo ""
        echo "  install              Primeiro deploy completo (build + start)"
        echo "  update               Puxa código, rebuilda e reinicia"
        echo "  status               Estado de todos os containers"
        echo "  logs [serviço]       Logs em tempo real (crawler|search|worker|postgres|redis)"
        echo "  restart              Recria só as apps (crawler, worker, search)"
        echo "  stop                 Para toda a stack"
        echo ""
        exit 1
        ;;
esac
