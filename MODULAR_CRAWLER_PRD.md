# PRD - Motor Unico de Fontes Buscaveis

## Objetivo

Construir um motor unico de ingestao, extracao e indexacao para qualquer fonte publica relevante ao Busca Mais.

O sistema deve tratar portais da transparencia, sites institucionais, noticias, paginas HTML, listagens, PDFs, anexos e protocolos como variacoes do mesmo problema: descobrir conteudo publico, extrair informacao util, normalizar e disponibilizar na busca.

O foco nao e armazenar arquivos como produto principal. O foco e extrair conteudo, metadados e contexto para melhorar a qualidade da busca.

---

## Decisao de Produto

Acabar com a separacao conceitual entre:

- fontes de paginas;
- catalogos de indexacao;
- documentos catalogados;
- paginas indexadas.

Tudo deve ser modelado como:

- uma **fonte buscavel**;
- varios **itens de conteudo** encontrados nessa fonte;
- um pipeline unico de descoberta, extracao, normalizacao, deduplicacao e indexacao.

Essa unificacao permite anexar, na mesma experiencia de busca, tanto dados oficiais de portais da transparencia quanto materias, comunicados e paginas de sites institucionais.

---

## Problema Atual

- Existem fluxos separados para sites institucionais e catalogos.
- `sources/pages` e `catalog_sources/catalog_documents` representam conceitos parecidos em tabelas e services diferentes.
- A busca precisa compensar essa divisao com `record_type` e tratamentos especiais.
- A manutencao de crawlers especificos tende a crescer de forma fragil.
- A qualidade final depende de juntar transparencia + contexto institucional, mas o modelo atual separa essas origens.

---

## Solucao

Criar uma arquitetura modular baseada em:

- fonte buscavel unica;
- item de conteudo unico;
- classificador de entradas;
- adaptadores por padrao de fonte/conteudo;
- pipeline unico de ingestao;
- indexacao unificada.

O sistema deve escolher automaticamente o melhor adaptador para cada entrada, sem exigir que o usuario decida previamente se aquilo e "pagina", "catalogo" ou "documento".

---

## Modelo de Dominio

### Fonte Buscavel

Representa qualquer origem publica que pode gerar conteudo indexavel.

Exemplos:

- portal da transparencia;
- site institucional;
- blog/noticias;
- diario oficial;
- pagina de publicacoes;
- listagem HTML;
- PDF direto;
- API publica.

Campos conceituais:

```json
{
  "id": "",
  "name": "",
  "baseUrl": "",
  "sourceKind": "institutional_site | transparency_portal | news_site | official_diary | api | pdf_feed | other",
  "crawlStrategy": "web_crawl | listing | sitemap | api | manual_url",
  "state": "",
  "city": "",
  "isActive": true,
  "schedule": "",
  "config": {}
}
```

### Item de Conteudo

Representa qualquer unidade encontrada e buscavel.

Exemplos:

- pagina institucional;
- materia/noticia;
- publicacao oficial;
- documento PDF;
- protocolo;
- anexo;
- item extraido de uma tabela.

Campos conceituais:

```json
{
  "id": "",
  "sourceId": "",
  "parentItemId": "",
  "url": "",
  "canonicalUrl": "",
  "title": "",
  "description": "",
  "text": "",
  "itemKind": "page | news | official_document | pdf | protocol | attachment | listing_item | other",
  "documentType": "",
  "documentNumber": "",
  "publicationDate": "",
  "department": "",
  "fileUrl": "",
  "contentHash": "",
  "metadata": {},
  "status": "pending | indexed | error",
  "lastCrawledAt": "",
  "lastIndexedAt": ""
}
```

---

## Arquitetura

### Core Engine

- scheduler;
- queue BullMQ;
- fetcher HTTP/browser;
- pipeline runner;
- deduplicador;
- indexador.

### Classificador

Responsavel por identificar o tipo provavel da entrada.

Possiveis saidas:

- `html.page`;
- `html.listing`;
- `html.detail`;
- `html.protocol`;
- `file.pdf`;
- `api.response`;
- `unknown`.

### Adaptadores

Cada adaptador deve implementar:

```js
canHandle(input) -> score
extract(input) -> ContentItem[]
```

O `score` permite escolher o adaptador mais adequado quando varios conseguirem lidar com a mesma entrada.

Tipos iniciais:

- `site.page.v1`
- `site.news.v1`
- `listing.table.v1`
- `detail.document.v1`
- `detail.protocol.v1`
- `file.pdf.v1`
- `api.generic.v1`

---

## Pipeline Unificado

1. Receber fonte ou URL.
2. Buscar conteudo.
3. Classificar entrada.
4. Selecionar adaptador.
5. Extrair `ContentItem[]`.
6. Normalizar campos.
7. Deduplicar por URL canonica e hash de conteudo.
8. Persistir ou atualizar item.
9. Enfileirar novos links/itens descobertos.
10. Indexar na busca.

---

## Estrategia de Migracao

A migracao deve ser incremental para manter o sistema funcionando.

### Fase 1 - Plano e Contratos

- Consolidar este PRD.
- Definir nomes finais das entidades/tabelas.
- Definir contrato dos adaptadores.
- Definir schema unico de indexacao no Typesense.

### Fase 2 - Modelo Unificado em Paralelo

- Criar novas entidades para fonte buscavel e item de conteudo.
- Manter tabelas antigas funcionando.
- Criar mapeadores de `pages` e `catalog_documents` para o novo formato.
- Nao remover fluxos antigos ainda.

### Fase 3 - Indexacao Unificada

- Fazer o indexador consumir o modelo unificado.
- Gerar o mesmo formato de documento para paginas, noticias, PDFs e documentos oficiais.
- Reduzir tratamentos especiais baseados em `record_type`.

### Fase 4 - Pipeline Modular

- Implementar classificador base.
- Implementar adaptadores iniciais.
- Migrar crawlers existentes para adaptadores.
- Absorver o fluxo de catalogo dentro do pipeline unico.

### Fase 5 - Remocao do Legado

- Remover services, rotas e telas duplicadas.
- Migrar dados restantes.
- Eliminar a separacao operacional entre fontes de paginas e catalogos.

---

## Atualizacao Incremental

- Usar hash de conteudo para detectar mudancas reais.
- Revalidar fontes por agendamento.
- Priorizar conteudo recente.
- Evitar reindexacao quando URL e conteudo nao mudaram.
- Guardar historico minimo de execucoes por fonte.

---

## Criterios de Aceitacao

- Uma unica ferramenta administra fontes institucionais e portais da transparencia.
- Uma unica busca retorna paginas, noticias, documentos oficiais, PDFs e anexos.
- Novos padroes podem ser suportados criando adaptadores, sem criar um fluxo paralelo.
- Dados de transparencia e conteudo institucional aparecem juntos quando relevantes.
- O sistema antigo continua funcionando durante a migracao.
- O indexador trabalha com um schema normalizado.
- A deduplicacao evita resultados repetidos entre pagina, detalhe e PDF.

---

## Proximos Passos Imediatos

1. Definir o nome final das novas entidades (`sources/content_items` ou equivalente).
2. Desenhar a migracao de `pages` e `catalog_documents` para o modelo unificado.
3. Criar o contrato de adaptadores em codigo.
4. Criar um indexador unificado que aceite o novo objeto normalizado.
5. Migrar primeiro o fluxo de catalogo de transparencia para provar o modelo.
6. Migrar depois o crawler de sites institucionais.
