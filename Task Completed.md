✅ **Implementação completa do sistema Busca+** - um mecanismo de busca com crawler distribuído!

## 📁 Estrutura criada:

### `busca-plus-crawler/` (Microsserviço Crawler)
- **Configuração**: database, redis, typesense, env
- **Models**: Source, Page, CrawlJob, SearchLog
- **Libs**: logger, url-utils, html-parser, crawler, indexer, queue
- **Workers**: Processamento assíncrono de jobs de crawling
- **Services**: source.service, page.service
- **API REST**: CRUD de fontes e páginas
- **Migrations**: 4 migrations para criação de tabelas
- **Scripts**: init-db, init-typesense

### `busca-plus-search/` (Microsserviço Search UI)
- **Interface web**: busca com filtros e paginação
- **API**: endpoints de busca e visualização de páginas
- **Integração**: Typesense para busca full-text

### `busca-plus/` (Raiz)
- **docker-compose.yml**: Orquestra todos os serviços
- **Dockerfiles**: Para os dois microsserviços
- **README.md**: Documentação completa
- **start.sh**: Script de inicialização
- **.gitignore**: Arquivos ignorados

## 🚀 Como usar:

```bash
cd busca-plus
docker-compose up -d
```

## 🔧 Serviços disponíveis:
- **Crawler API**: http://localhost:3000
- **Search UI**: http://localhost:3001  
- **Typesense**: http://localhost:8108
- **Redis**: localhost:6379
- **PostgreSQL**: localhost:5432

## 📋 Arquitetura:
- **Frontend**: EJS templates com Bootstrap
- **Backend**: Node.js + Express
- **Bus de mensagens**: Redis + BullMQ
- **Banco de dados**: PostgreSQL + Sequelize
- **Motor de busca**: Typesense
- **Crawler**: Playwright + Cheerio


## Contrato de entrada de dados!


```bash
Invoke-RestMethod -Uri "http://localhost:3001/api/sources" `
  -Method POST `
  -Body (@{
    name = "Prefeitura de Cujubim"
    url  = "https://cujubim.ro.gov.br/noticias/"
  } | ConvertTo-Json) `
  -ContentType "application/json"
```

## Rebuld somente de Imagem especifica

```bash
docker-compose up -d search-ui

docker-compose restart search-ui crawler worker

```
## Comandos windows 

```bash

.\manage.ps1 start      # Iniciar
.\manage.ps1 build     # Build crawler e iniciar
.\manage.ps1 init     # Inicializar banco
.\manage.ps1 logs      # Ver logs
.\manage.ps1 status    # Ver status
.\manage.ps1 clean     # Limpar tudo

```