# busca-plus-search

Interface de busca do ecossistema Busca+.

## Estrutura atual

```text
src/
  api/
    controllers/
    middlewares/
    routes/
    validators/
  config/
  libs/
  modules/
    search/
  utils/
  views/
  app.js
  index.js
```

## Convencoes

- `src/index.js`: ponto de entrada do servidor.
- `src/app.js`: composicao do Express sem bootstrap.
- `src/api`: camada HTTP.
- `src/modules`: regras por feature.
- `src/config`, `src/libs`, `src/utils`: infraestrutura compartilhada.

## Proxima etapa sugerida

- Padronizar endpoints por feature (`search`, `images`, `health`).
- Criar testes de controller e service antes de refactors mais agressivos.
- Extrair view-models para reduzir logica de render dentro do controller.
