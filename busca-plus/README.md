# Busca+

Workspace de desenvolvimento do ecossistema Busca+.

## Estrutura

- `../busca-plus-crawler`: backend, admin, crawler e worker
- `../busca-plus-search`: frontend/interface de busca
- `./docker-compose.dev.yml`: infraestrutura local

## Fluxo de desenvolvimento

Docker fica apenas para infraestrutura:

- PostgreSQL
- Redis
- Typesense

As aplicações `crawler` e `search` rodam localmente com `npm run dev`.

## Pré-requisitos

- Docker Desktop
- Node.js 18+
- Dependências instaladas em `busca-plus`, `busca-plus-crawler` e `busca-plus-search`

## Setup inicial

```bash
cd busca-plus-crawler
npm install

cd ../busca-plus-search
npm install

cd ../busca-plus
npm install
```

## Comandos principais

Na pasta `busca-plus`:

```bash
npm run infra:up
```

Sobe apenas PostgreSQL, Redis e Typesense.

```bash
npm run init
```

Inicializa banco e Typesense via `crawler`.

```bash
npm run dev
```

Roda `crawler` e `search` no mesmo terminal.

```bash
npm run dev:all
```

Roda `crawler`, `search` e `worker`.

```bash
npm run dev:boot
```

Sobe infraestrutura e já inicia `crawler + search`.

```bash
npm run dev:boot:all
```

Sobe infraestrutura e já inicia `crawler + search + worker`.

## Atalhos Windows

Na pasta `busca-plus`:

```powershell
.\dev.ps1
```

Sobe infraestrutura e inicia `crawler + search`.

```powershell
.\dev.ps1 -WithWorker
```

Inclui o worker.

```powershell
.\dev.ps1 -Init
```

Sobe infraestrutura, inicializa banco/Typesense e depois entra no `dev`.

Também existe o atalho:

```cmd
dev.cmd
dev.cmd --all
dev.cmd --init
```

## Limpeza total

Para remover containers antigos, orfãos, volumes do projeto e limpar pastas locais:

```bash
npm run infra:clean
```

Isso remove inclusive nomes legados como:

- `busca-plus-search-dev`
- `busca-plus-search`
- `busca-plus-worker`
- `busca-plus-crawler`
- `busca-plus-minio`
- `busca-plus-postgres`
- `busca-plus-redis`
- `busca-plus-typesense`

## Endereços locais

- Busca: `http://localhost:3000`
- Admin/Crawler API: `http://localhost:3001`
- Typesense: `http://localhost:8108`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Fluxo recomendado diário

```bash
cd busca-plus
npm run dev:boot
```

Se precisar resetar tudo:

```bash
npm run infra:clean
npm run dev:boot
```
