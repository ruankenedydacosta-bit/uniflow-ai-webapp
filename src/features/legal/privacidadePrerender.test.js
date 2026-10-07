// A Política de Privacidade precisa chegar inteira no HTML, sem JavaScript:
// é o que o revisor do Google OAuth e das lojas lê. Estes testes renderizam a
// página pelo mesmo caminho do build (scripts/prerender-legal.mjs, Vite em
// modo SSR, ambiente node, sem window).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { injectIntoShell, renderLegalRoutes } from '../../../scripts/prerender-legal.mjs';
import { PROVEDORES } from './politicaDePrivacidade.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

function textoVisivel(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const paginas = await renderLegalRoutes();
const privacidade = paginas.find((pagina) => pagina.url === '/privacidade');

test('o prerender gera /privacidade com o texto inteiro', () => {
  assert.ok(privacidade, 'rota /privacidade não foi renderizada');
  assert.match(privacidade.html, /<h1[^>]*>Política de Privacidade<\/h1>/);
  assert.ok(
    textoVisivel(privacidade.html).length > 8000,
    'texto curto demais: a página provavelmente renderizou vazia',
  );
});

test('todo provedor da lista aparece na página', () => {
  const texto = textoVisivel(privacidade.html);
  for (const nome of ['Supabase', 'Vercel', 'OpenAI', 'ElevenLabs', 'Asaas', 'Google', 'Sentry']) {
    assert.ok(PROVEDORES.some((provedor) => provedor.nome === nome), `${nome} saiu de PROVEDORES`);
    assert.ok(texto.includes(nome), `${nome} não aparece na página`);
  }
});

test('a seção do Google traz escopos, Uso Limitado e revogação', () => {
  const html = privacidade.html;
  for (const escopo of ['openid', 'userinfo.email', 'userinfo.profile']) {
    assert.ok(html.includes(escopo), `escopo ${escopo} ausente`);
  }
  assert.ok(html.includes('https://developers.google.com/terms/api-services-user-data-policy'));
  assert.ok(html.includes('Uso Limitado'));
  assert.ok(html.includes('https://myaccount.google.com/permissions'));
  assert.match(textoVisivel(html), /não são usados para treinar modelos/);
});

test('o HTML final troca título, idioma e conteúdo do shell', () => {
  const shell = '<!doctype html><html lang="en"><head><title>uniflow-ai-app</title></head>'
    + '<body><div id="uniflow-splash"></div><div id="root"></div></body></html>';
  const html = injectIntoShell(shell, privacidade);

  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<title>Política de Privacidade \| UniFlow AI<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]+LGPD\." \/>/);
  assert.match(html, /<noscript><style>#uniflow-splash \{ display: none; \}<\/style><\/noscript>/);
  assert.ok(html.includes(`<div id="root">${privacidade.html}</div>`));
  assert.doesNotMatch(html, /uniflow-ai-app/);
});

test('o build roda o prerender e a rota é pública', async () => {
  const pkg = JSON.parse(await source('../../../package.json'));
  assert.match(pkg.scripts.build, /vite build && node scripts\/prerender-legal\.mjs/);

  const routes = await source('../../app/routes.jsx');
  const publicas = routes.slice(routes.indexOf('export const publicRoutes'), routes.indexOf('export const appRoutes'));
  assert.match(publicas, /path: PRIVACIDADE_ROUTE,/);
});

test('o cadastro e a tela Sobre levam à política', async () => {
  const aviso = await source('../auth-mobile/components/AuthLegalNotice.jsx');
  assert.match(aviso, /href=\{PRIVACIDADE_ROUTE\}/);
  const sobre = await source('../simplified-app/SimplifiedAboutPage.jsx');
  assert.match(sobre, /href=\{PRIVACIDADE_ROUTE\}/);
});

test('a Vercel serve o arquivo pré-renderizado antes do catch-all do SPA', async () => {
  const { rewrites } = JSON.parse(await source('../../../vercel.json'));
  const privacidade = rewrites.findIndex((rewrite) => rewrite.source === '/privacidade');
  const catchAll = rewrites.findIndex((rewrite) => rewrite.source === '/(.*)');
  assert.ok(privacidade !== -1, 'rewrite de /privacidade ausente');
  assert.equal(rewrites[privacidade].destination, '/privacidade/index.html');
  assert.ok(privacidade < catchAll, 'o rewrite precisa vir antes do catch-all');
});
