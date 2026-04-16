# Busca+ - Motor de Busca Brasileiro

## Visão Geral do Projeto

**Busca+** é um motor de busca brasileiro com interface estilo Google, crawlers personalizáveis, e indexação no Typesense. Desenvolvido com Node.js, PostgreSQL, Redis e Docker.

## Arquitetura

```
busca-plus/
├── busca-plus-crawler/      # Serviço de crawl e API
├── busca-plus-search/        # Interface de busca (EJS)
├── docker-compose.yml        # Orquestração Docker
├── manage.ps1               # Scripts de gerenciamento
└── images/                  # Imagens baixadas (compartilhado)
```

### Stack Tecnológica

| Componente | Tecnologia | Porta |
|------------|-----------|-------|
| API/Crawler | Node.js + Express | 3001 |
| Interface | EJS + Bootstrap | 3000 |
| Banco | PostgreSQL 15 | 5432 |
| Fila | Redis 7 | 6379 |
| Busca | Typesense 0.24.1 | 8108 |
| Armazenamento | MinIO (S3-like) | 9000 |

## Modelos de Dados

### Sources (Fontes de Crawl)
```
id, name, base_url, type, category, is_active,
crawl_depth, follow_internal_links, download_images,
schedule, last_crawled_at, config_json
```

### Pages (Páginas Crawleadas)
```
id, source_id, url, slug, title, description,
content_text, content_html, language, status_code,
hash_url, hash_content, word_count,
last_crawled_at, last_indexed_at, is_active,
has_error, error_message, metadata_json
images (JSON - array de imagens com contexto)
```

### CrawlJobs (Jobs de Crawl)
```
id, source_id, type, status, started_at, finished_at,
pages_found, pages_crawled, pages_saved, pages_errored,
attempts, duration_ms, payload_json, result_json
```

### SearchLogs (Logs de Busca)
```
id, query, results_count, response_time_ms, user_agent, ip
```

## API Endpoints

### Fontes
- `GET /api/sources` - Listar fontes
- `POST /api/sources` - Criar fonte
- `GET /api/sources/:id` - Detalhes da fonte
- `PUT /api/sources/:id` - Atualizar fonte
- `DELETE /api/sources/:id` - Deletar fonte
- `POST /api/sources/:id/crawl` - Iniciar crawl
- `GET /api/sources/:id/crawl-status` - Status do crawl
- `GET /api/sources/:id/stats` - Estatísticas da fonte

### Páginas
- `GET /api/pages` - Listar páginas
- `GET /api/pages/:id` - Detalhes da página
- `DELETE /api/pages/:id` - Deletar página

### Jobs
- `POST /api/jobs/:id/cancel` - Cancelar job
- `DELETE /api/jobs/:id` - Deletar job
- `POST /api/jobs/clean-completed` - Limpar jobs concluídos

### Admin
- `GET /api/admin/stats` - Estatísticas gerais
- `GET /api/admin/sources` - Fontes com contagem
- `GET /api/admin/pages` - Páginas com filtros
- `GET /api/admin/jobs` - Jobs com filtros
- `GET /api/admin/errors` - Páginas com erros
- `GET /api/admin/search-logs` - Logs de busca
- `POST /api/admin/clear-index` - Limpar índice Typesense
- `POST /api/admin/clear-database` - Limpar banco PostgreSQL
- `POST /api/admin/clear-all` - Limpar tudo
- `POST /api/admin/reindex-all` - Reindexar todas páginas
- `GET /api/admin/index-stats` - Estatísticas do Typesense

### Busca
- `GET /api/search?q=termo&type=all|images` - Buscar

## Features Implementadas

### Interface de Busca
- Layout estilo Google com logo "Busca+"
- Abas funcionais: Todos, Imagens, Vídeos, Notícias
- 2 colunas: resultados esquerda, destaque direita
- Links mudam de cor quando visitados
- Clique no logo volta para home
- Barra de busca só aparece com resultados

### Sistema de Imagens
- Extração de contexto (texto próximo, alt, filename)
- Limite de 5 imagens por página
- Deduplicação (original vs thumbnail)
- Grid 5 colunas para visualização
- Modal lateral para imagem ampliada
- Thumbnails 320x240 com Sharp

### Crawler
- Browser automation com Playwright
- Extração de metadata (OG, Twitter cards)
- Parsing de HTML com Cheerio
- Download e compressão de imagens
- Queue com BullMQ + Redis
- Suporte a crawl profundo

### Indexação Typesense
Campos indexados:
```
title, description, content, url, slug,
sourceId, sourceName, category, domain,
language, images, imageThumbnails, imageAlts,
imageContext, imageFilenames, hasImages,
crawledAt, relevanceScore
```

### Painel Admin
- Dashboard com estatísticas
- Gerenciamento de fontes
- Visualização de jobs
- Logs de busca
- Botões de limpeza (índice, banco, tudo)
- Reindexação manual

## Funcionalidades a Considerar

### Alta Prioridade
1. **Filtros de busca avançados** - Data, categoria, domínio
2. **Paginação de resultados** - Mais resultados por página
3. **Cache de busca** - Redis para queries frequentes
4. **Rate limiting** - Proteger API de abuses

### Média Prioridade
1. **Autocomplete/Suggestions** - Baseado em logs de busca
2. **Busca por similaridade** - Usar vector search do Typesense
3. **Relatórios de crawl** - Dashboard de performance
4. **Agendamento de crawl** - Cron jobs configuráveis

### Baixa Prioridade
1. **Exportar resultados** - CSV, JSON
2. **API pública** - Para desenvolvedores
3. **Multi-idioma** - Interface em inglês
4. **Dark mode** - Tema escuro

## Configurações Importantes

### Ambiente (.env)
```
DATABASE_URL=postgres://buscaplus:buscaplus123@postgres:5432/buscaplus
REDIS_URL=redis://redis:6379
TYPESENSE_API_KEY=buscaplus_api_key
TYPESENSE_HOST=typesense
TYPESENSE_PORT=8108
```

### Constantes do Crawler (crawler.js)
```javascript
MAX_IMAGES_PER_PAGE = 5
MAX_IMAGE_SIZE = 2MB
THUMBNAIL_WIDTH = 320
THUMBNAIL_HEIGHT = 240
CRAWL_TIMEOUT = 30000
```

## Problemas Conhecidos

1. **Índices não atualizados** - `last_indexed_at` não é atualizado após reindexação
2. **sourceName/sourceUrl null** - Informações da fonte não vêm no search
3. **Encoding ISO-8859-1** - Caracteres especiais perdendo formatação
4. **Content HTML genérico** - Extrai conteúdo de sidebar em vez de article

## Dicas para Nova Funcionalidade

1. **Typesense** - Schema em `src/config/typesense.js`,.collection recriada ao limpar índice
2. **Imagens** - Servidas pelo crawler em `/images/*`, CORS configurado
3. **Docker** - Changes no código: `docker-compose restart crawler`
4. **Banco vs Typesense** - São independentes, limpar ambos para reset completo
