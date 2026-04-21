# PRD - Modular Ingestion & Indexing Engine

## Objetivo
Construir um motor de indexação de documentos públicos (portais da transparência) baseado em extração de conteúdo (não armazenamento de arquivos).

---

## Problema Atual
- Múltiplos formatos de portais
- Dificuldade de busca nos sistemas oficiais
- Falta de padronização

---

## Solução
Arquitetura modular baseada em:

- Core Engine
- Classificador
- Adaptadores por padrão
- Extração de conteúdo
- Indexação

---

## Arquitetura

### Core
- crawler
- scheduler
- queue (BullMQ)
- fetcher

### Classificador
Função:
- identificar tipo de página

Saída:
- listing
- detail
- pdf
- protocol

---

## Adaptadores

Cada adaptador deve implementar:

```js
canHandle(input) -> score
extract(input) -> normalized object
```

### Tipos
- listing.table.v1
- detail.document.v1
- detail.protocol.v1
- file.pdf.v1

---

## Modelo de Dados

```json
{
  "title": "",
  "date": "",
  "type": "",
  "number": "",
  "department": "",
  "sourceUrl": "",
  "text": "",
  "attachments": []
}
```

---

## Pipeline

1. Discover URL
2. Classify
3. Extract
4. Normalize
5. Deduplicate
6. Index

---

## Atualização

- Hash por conteúdo
- Revalidação incremental
- Prioridade por recência

---

## Critérios de Aceitação

- Suporte a múltiplos formatos
- Extração consistente
- Indexação funcional
- Busca por texto livre

---

## Próximos Passos

1. Implementar classificador base
2. Criar adaptadores iniciais
3. Criar pipeline de indexação
4. Integrar busca
