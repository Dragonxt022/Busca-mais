# Busca+

Motor de busca modular para portais de transparência e fontes web. Permite indexar, rastrear e pesquisar conteúdo com suporte a IA para resumos automáticos.

## Visão geral

```
Busca-mais/
├── busca-plus-crawler/   # Backend: API REST, painel admin, crawler, worker de fila
├── busca-plus-search/    # Frontend: interface pública de busca
└── busca-plus/           # Orquestrador: docker-compose, scripts de dev e deploy
```

### Serviços

| Serviço | Porta | Descrição |
|---|---|---|
| **search** | 3000 | Interface pública de busca |
| **crawler** | 3001 | API REST + painel admin |
| **worker** | — | Processador de fila (BullMQ) |
| **PostgreSQL** | 5432 | Banco de dados principal |
| **Redis** | 6379 | Fila de jobs e cache |
| **Typesense** | 8108 | Motor de busca full-text |

---

## Desenvolvimento local

### Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Node.js 20+

### Setup inicial

```bash
# Instalar dependências de todos os serviços
cd busca-plus-crawler && npm install
cd ../busca-plus-search && npm install
cd ../busca-plus && npm install
```

### Subir o ambiente

Na pasta `busca-plus/`:

```bash
# Sobe infraestrutura (Postgres, Redis, Typesense) + aplicações
npm run dev:boot

# Inclui o worker de processamento de fila
npm run dev:boot:all
```

**Windows** — atalho PowerShell:

```powershell
.\dev.ps1           # crawler + search
.\dev.ps1 -WithWorker  # inclui worker
.\dev.ps1 -Init     # inicializa banco/Typesense na primeira vez
```

### Primeiro uso

```bash
# Dentro de busca-plus/
npm run init        # roda migrations + inicializa Typesense
```

### Endereços locais

| URL | Serviço |
|---|---|
| `http://localhost:3000` | Interface de busca |
| `http://localhost:3001/admin` | Painel admin |
| `http://localhost:8108` | Typesense |

### Outros comandos úteis

```bash
npm run infra:up      # só a infraestrutura Docker
npm run infra:down    # para a infraestrutura
npm run infra:clean   # limpa containers, volumes e dados locais
npm run dev           # crawler + search (sem subir infra)
npm run dev:all       # crawler + search + worker
```

---

## Deploy em produção (VPS)

### Pré-requisitos na VPS

- Docker Engine + Docker Compose plugin
- Git
- 4 vCPUs / 8 GB RAM / 50 GB disco (mínimo recomendado)

### Passo a passo

#### 1. Clonar o repositório

```bash
git clone https://github.com/Dragonxt022/Busca-mais.git
cd Busca-mais/busca-plus
```

#### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

Preencha obrigatoriamente:

```env
POSTGRES_PASSWORD=senha_forte_aqui
TYPESENSE_API_KEY=$(openssl rand -hex 32)
```

#### 3. Executar o deploy

```bash
chmod +x deploy.sh
./deploy.sh install
```

O script faz automaticamente:
- Build das imagens Docker
- Aguarda o Postgres ficar saudável
- Roda as migrations do banco
- Inicializa as coleções do Typesense
- Sobe todos os serviços

#### 4. Configurar domínio

Edite [busca-plus/nginx/default.conf](busca-plus/nginx/default.conf) e substitua `seudominio.com.br` pelo seu domínio real. Em seguida:

```bash
./deploy.sh restart
```

#### 5. SSL com Let's Encrypt

```bash
# Instalar certbot na VPS (exemplo Ubuntu)
apt install certbot python3-certbot-nginx -y

# Emitir certificado
certbot --nginx -d seudominio.com.br -d admin.seudominio.com.br
```

### Comandos de operação

```bash
./deploy.sh status    # estado dos containers
./deploy.sh logs      # logs em tempo real (todos os serviços)
./deploy.sh logs crawler  # logs de um serviço específico
./deploy.sh update    # puxa o código novo e recria os serviços
./deploy.sh restart   # reinicia serviços de aplicação
./deploy.sh stop      # para tudo
```

---

## Configuração

### Variáveis de ambiente

Todas as variáveis estão documentadas em [busca-plus/.env.example](busca-plus/.env.example).

| Variável | Padrão | Descrição |
|---|---|---|
| `POSTGRES_PASSWORD` | — | **Obrigatório.** Senha do banco |
| `TYPESENSE_API_KEY` | — | **Obrigatório.** Chave do Typesense |
| `AI_PROVIDER` | `ollama` | Provider de IA: `ollama` ou `google` |
| `OLLAMA_MODEL` | `llama3.1:8b` | Modelo Ollama para resumos |
| `GOOGLE_AI_API_KEY` | — | Chave Google Gemini (se usar Google) |
| `CRAWLER_MAX_PAGES` | `100` | Limite de páginas por crawl |
| `CRAWLER_MAX_DEPTH` | `3` | Profundidade máxima do crawler |

### Provider de IA

O serviço de busca gera resumos automáticos dos resultados via IA. Duas opções:

**Ollama (local — padrão):**
```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.1:8b
```

**Google Gemini:**
```env
AI_PROVIDER=google
GOOGLE_AI_API_KEY=sua_chave_aqui
GOOGLE_AI_MODEL=gemini-2.0-flash
```

---

## Banco de dados

### Migrations

```bash
# Rodar migrations pendentes
cd busca-plus-crawler
npm run migrate

# Desfazer todas (cuidado em produção)
npx sequelize-cli db:migrate:undo:all
```

### Seeds

```bash
# Inserir dados de patrocinadores de exemplo
npm run seed:sponsors

# Desfazer seed de patrocinadores
npx sequelize-cli db:seed:undo --seed seeders/20260418000100-demo-sponsors.js
```

---

## Arquitetura de deploy

```
Internet
   │
   ▼
 Nginx (80/443)
   ├── seudominio.com.br     ──► search:3000
   └── admin.seudominio.com.br ──► crawler:3001
                                       │
                              ┌────────┼────────┐
                              ▼        ▼        ▼
                          Postgres  Redis  Typesense
                              ▲
                           worker
                        (processa fila)
```

---

## Estrutura de arquivos relevantes

```
busca-plus/
├── docker-compose.prod.yml  # Stack completa de produção
├── docker-compose.dev.yml   # Só infraestrutura (dev)
├── .env.example             # Template de variáveis
├── deploy.sh                # Script de automação de deploy
└── nginx/
    └── default.conf         # Proxy reverso

busca-plus-crawler/
├── src/
│   ├── api/                 # Rotas e controllers
│   ├── config/              # env, database, redis, typesense
│   ├── models/              # Modelos Sequelize
│   ├── modules/             # Módulos de feature
│   ├── workers/             # Processadores de fila BullMQ
│   └── scripts/             # init-db, init-typesense
├── migrations/              # Migrations Sequelize
├── seeders/                 # Seeds de dados iniciais
├── Dockerfile
└── entrypoint.sh            # Roda migrations e inicia o servidor

busca-plus-search/
├── src/
│   ├── api/                 # Rotas e controllers
│   ├── modules/ai/          # Resumos via IA
│   └── public/              # Assets estáticos
└── Dockerfile
```
