#!/bin/bash
# =============================================================
# Busca+ — Deploy automatizado (infra Docker + apps PM2)
#
# Uso:
#   chmod +x deploy.sh
#
#   Primeiro deploy:  ./deploy.sh install
#   Atualizar:        ./deploy.sh update
#   Status:           ./deploy.sh status
#   Logs:             ./deploy.sh logs [busca-crawler|busca-search|busca-worker]
#   Reiniciar apps:   ./deploy.sh restart
#   Parar tudo:       ./deploy.sh stop
# =============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(dirname "$PROJECT_DIR")"
CRAWLER_DIR="$BASE_DIR/busca-plus-crawler"
SEARCH_DIR="$BASE_DIR/busca-plus-search"
INFRA_COMPOSE="docker-compose.yml"

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

    command -v node >/dev/null 2>&1 \
        || error "Node.js não encontrado. Instale com: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"

    command -v pm2 >/dev/null 2>&1 || {
        warn "PM2 não encontrado. Instalando..."
        npm install -g pm2
    }

    info "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
    info "Node.js $(node --version)"
    info "PM2 $(pm2 --version)"
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

# ── Infraestrutura Docker (Postgres, Redis, Typesense) ────────
start_infra() {
    step "Iniciando infraestrutura (Postgres, Redis, Typesense)"

    docker compose -f "$INFRA_COMPOSE" up -d

    info "Aguardando PostgreSQL ficar pronto..."
    timeout=120; elapsed=0
    until docker compose -f "$INFRA_COMPOSE" exec -T postgres \
        pg_isready -U "${POSTGRES_USER:-buscaplus}" -q 2>/dev/null; do
        sleep 3; elapsed=$((elapsed+3))
        [ $elapsed -ge $timeout ] && error "Timeout aguardando PostgreSQL."
    done

    info "Infraestrutura pronta"
}

# ── Instalar dependências Node.js ─────────────────────────────
npm_install() {
    step "Instalando dependências"
    npm ci --only=production --prefix "$CRAWLER_DIR"
    npm ci --only=production --prefix "$SEARCH_DIR"
    info "Dependências instaladas"
}

# ── Migrations ────────────────────────────────────────────────
run_migrations() {
    step "Rodando migrations do banco"
    cd "$CRAWLER_DIR"
    NODE_ENV=production \
    DB_DIALECT=postgres \
    DB_HOST="${DB_HOST:-localhost}" \
    DB_PORT="${DB_PORT:-5432}" \
    DB_NAME="${POSTGRES_DB:-buscaplus}" \
    DB_USER="${POSTGRES_USER:-buscaplus}" \
    DB_PASS="$POSTGRES_PASSWORD" \
    npx sequelize-cli db:migrate
    cd "$PROJECT_DIR"
    info "Migrations concluídas"
}

# ── Inicializar Typesense ─────────────────────────────────────
init_typesense() {
    step "Inicializando coleções do Typesense"
    cd "$CRAWLER_DIR"
    NODE_ENV=production \
    TYPESENSE_HOST="${TYPESENSE_HOST:-localhost}" \
    TYPESENSE_PORT="${TYPESENSE_PORT:-8108}" \
    TYPESENSE_API_KEY="$TYPESENSE_API_KEY" \
    node src/scripts/init-typesense.js \
        && info "Typesense inicializado" \
        || warn "init-typesense falhou ou coleções já existem (ignorando)"
    cd "$PROJECT_DIR"
}

# ── Iniciar apps com PM2 ──────────────────────────────────────
start_apps() {
    step "Iniciando aplicações com PM2"
    mkdir -p "$PROJECT_DIR/logs"

    # Exporta variáveis do .env para o ecosystemconfig as leia via process.env
    set -a; source .env; set +a

    if pm2 list | grep -q "busca-crawler"; then
        pm2 reload ecosystem.config.js --update-env
    else
        pm2 start ecosystem.config.js
    fi

    pm2 save
    info "Apps iniciados"
}

# ── Configurar PM2 no boot do sistema ────────────────────────
setup_startup() {
    step "Configurando PM2 para iniciar no boot"
    pm2 startup | tail -1 | bash 2>/dev/null \
        && info "PM2 configurado no boot" \
        || warn "Execute manualmente o comando gerado por: pm2 startup"
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
    start_infra
    npm_install
    run_migrations
    init_typesense
    start_apps
    setup_startup
    echo ""
    info "════════ Deploy concluído! ════════"
    echo ""
    echo "  Busca pública : https://buscamais.cipilimitada.com.br   (porta 3002)"
    echo "  Painel Admin  : https://admin.buscamais.cipilimitada.com.br (porta 3001)"
    echo ""
    echo "  pm2 status          → ver processos"
    echo "  ./deploy.sh logs    → ver logs em tempo real"
    echo "  ./deploy.sh update  → atualizar após git push"
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
    start_infra
    npm_install
    run_migrations
    start_apps
    info "════════ Atualização concluída! ════════"
}

cmd_logs() {
    local service="${2:-}"
    if [ -n "$service" ]; then
        pm2 logs "$service" --lines 100
    else
        pm2 logs --lines 100
    fi
}

cmd_stop() {
    step "Parando aplicações e infraestrutura"
    pm2 stop all 2>/dev/null || true
    docker compose -f "$INFRA_COMPOSE" down
    info "Tudo parado."
}

cmd_restart() {
    step "Reiniciando aplicações"
    set -a; source .env; set +a
    pm2 reload ecosystem.config.js --update-env
    info "Apps reiniciados."
}

cmd_status() {
    echo ""
    info "── PM2 (aplicações) ──"
    pm2 status
    echo ""
    info "── Docker (infraestrutura) ──"
    docker compose -f "$INFRA_COMPOSE" ps
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
        echo "  install          Primeiro deploy completo"
        echo "  update           Atualiza código e reinicia apps"
        echo "  status           Estado dos processos e containers"
        echo "  logs [serviço]   Logs em tempo real (busca-crawler|busca-search|busca-worker)"
        echo "  restart          Reinicia os apps Node.js"
        echo "  stop             Para apps e infraestrutura"
        echo ""
        exit 1
        ;;
esac
