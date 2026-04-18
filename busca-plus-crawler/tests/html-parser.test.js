const test = require('node:test');
const assert = require('node:assert/strict');

const HtmlParser = require('../src/libs/html-parser');

test('HtmlParser keeps title, text and image from the same primary article', () => {
  const html = `
    <html>
      <head>
        <title>Prefeitura de Cujubim realiza reuniao sobre seguranca nas escolas</title>
        <meta property="og:title" content="Prefeitura de Cujubim realiza reuniao sobre seguranca nas escolas">
      </head>
      <body>
        <main>
          <article class="post">
            <h1>Prefeitura de Cujubim realiza reuniao sobre seguranca nas escolas</h1>
            <p>Em uma iniciativa voltada para o fortalecimento da seguranca escolar, a prefeitura reuniu autoridades e gestores.</p>
            <img src="/uploads/reuniao-seguranca.jpg" alt="Reuniao de seguranca">
            <p>Durante o encontro, foram apresentados protocolos preventivos e um cronograma de visitas tecnicas.</p>
          </article>

          <section class="related-posts">
            <article>
              <h2>Outra materia</h2>
              <img src="/uploads/outra-materia.jpg" alt="Outra materia">
              <p>Conteudo relacionado que nao deve contaminar o resultado principal.</p>
            </article>
          </section>
        </main>
      </body>
    </html>
  `;

  const parser = new HtmlParser(html, 'https://cujubim.ro.gov.br/noticias/reuniao-seguranca-escolas');
  const payload = parser.extractAll();

  assert.match(payload.title, /seguranca nas escolas/i);
  assert.match(payload.contentText, /fortalecimento da seguranca escolar/i);
  assert.equal(payload.images[0].src, 'https://cujubim.ro.gov.br/uploads/reuniao-seguranca.jpg');
});
