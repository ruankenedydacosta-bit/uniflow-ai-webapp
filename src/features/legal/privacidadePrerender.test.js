// A Política de Privacidade precisa chegar inteira no HTML, sem JavaScript:
// é o que o revisor do Google OAuth e das lojas lê. Estes testes renderizam a
// página pelo mesmo caminho do build (scripts/prerender-legal.mjs, Vite em
// modo SSR, ambiente node, sem window).
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
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
  assert.ok(PROVEDORES.length >= 9);
  for (const provedor of PROVEDORES) {
    assert.ok(texto.includes(provedor.nome), `${provedor.nome} não aparece na página`);
  }
});

// Domínio externo encontrado no código -> provedor que precisa estar em
// PROVEDORES. Domínio que não recebe dado do usuário vai em SEM_DADO_PESSOAL.
const PROVEDOR_POR_DOMINIO = [
  [/\.supabase\.co$/, 'Supabase'],
  [/^api\.openai\.com$/, 'OpenAI'],
  [/^(api|api-sandbox|sandbox|checkout)\.asaas\.com$/, 'Asaas'],
  [/^fonts\.(googleapis|gstatic)\.com$/, 'Google'],
  [/^www\.googletagmanager\.com$/, 'Google'],
  // Google Agenda (#99): OAuth e Calendar API.
  [/^(accounts\.google|oauth2\.googleapis|www\.googleapis)\.com$/, 'Google'],
  [/^wa\.me$/, 'WhatsApp (Meta)'],
];
const PROVEDOR_POR_PACOTE = [
  [/from ['"]@sentry\//, 'Sentry'],
  [/from ['"](npm:)?web-push/, 'Serviços de notificação do navegador (Google, Apple e Mozilla)'],
  // Leitura do mês (#122): o SDK chama api.anthropic.com sem a URL no código.
  [/from ['"](npm:)?@anthropic-ai\/sdk/, 'Anthropic'],
];
const SEM_DADO_PESSOAL = [
  /^docs\.asaas\.com$/, // links de documentação em comentários
  /^developers\.google\.com$/, /^myaccount\.google\.com$/, /^www\.gov\.br$/, // links desta página
  /^app\.uniflow\.ai$/, /^(www\.)?uniflow-ai\.com\.br$/, /^uniflow\.(local|invalid)$/, // domínios próprios
  /^react\.dev$/, /^github\.com$/,
  /(^|\.)example(\.com)?$/, /\.(test|invalid|local|example)$/, /^exemplo\.com$/,
];

async function arquivosDeCodigo(pasta) {
  const raiz = new URL(`../../../${pasta}/`, import.meta.url);
  const nomes = await readdir(raiz, { recursive: true });
  return nomes
    .filter((nome) => /\.(js|jsx|ts|mjs|css|html)$/.test(nome))
    .filter((nome) => !/\.test\.|node_modules/.test(nome))
    .map((nome) => new URL(nome, raiz));
}

test('todo domínio externo chamado pelo código tem provedor na política', async () => {
  const arquivos = [
    ...(await arquivosDeCodigo('src')),
    ...(await arquivosDeCodigo('supabase/functions')),
    ...(await arquivosDeCodigo('public')),
    new URL('../../../index.html', import.meta.url),
  ];
  const nomes = new Set(PROVEDORES.map((provedor) => provedor.nome));
  const faltando = [];

  for (const arquivo of arquivos) {
    const codigo = await readFile(arquivo, 'utf8');
    for (const [, dominio] of codigo.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/g)) {
      if (SEM_DADO_PESSOAL.some((padrao) => padrao.test(dominio))) continue;
      const provedor = PROVEDOR_POR_DOMINIO.find(([padrao]) => padrao.test(dominio))?.[1];
      if (!provedor || !nomes.has(provedor)) faltando.push(`${dominio} (${arquivo.pathname})`);
    }
    for (const [padrao, provedor] of PROVEDOR_POR_PACOTE) {
      if (padrao.test(codigo) && !nomes.has(provedor)) faltando.push(`${provedor} (${arquivo.pathname})`);
    }
  }

  assert.deepEqual(
    [...new Set(faltando)],
    [],
    'domínio externo sem provedor na Política de Privacidade: adicione em PROVEDORES ou, se não recebe dado do usuário, em SEM_DADO_PESSOAL',
  );
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
  assert.match(html, /<meta property="og:title" content="Política de Privacidade \| UniFlow AI" \/>/);
  assert.doesNotMatch(html, /uniflow-ai-app/);
});

test('o prerender falha se o shell mudar e uma troca não acontecer', () => {
  const semTitulo = '<html lang="en"><head></head><body><div id="root"></div></body></html>';
  assert.throws(() => injectIntoShell(semTitulo, privacidade), /<title>/);
  const semRoot = '<html lang="en"><head><title>x</title></head><body><div id="app"></div></body></html>';
  assert.throws(() => injectIntoShell(semRoot, privacidade), /root/);
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
  assert.match(sobre, /<Link className=\{styles\.footerLink\} to=\{PRIVACIDADE_ROUTE\}>/);
});

test('a Vercel serve o arquivo pré-renderizado antes do catch-all do SPA', async () => {
  const { rewrites } = JSON.parse(await source('../../../vercel.json'));
  const privacidade = rewrites.findIndex((rewrite) => rewrite.source === '/privacidade');
  const catchAll = rewrites.findIndex((rewrite) => rewrite.source === '/(.*)');
  assert.ok(privacidade !== -1, 'rewrite de /privacidade ausente');
  assert.equal(rewrites[privacidade].destination, '/privacidade/index.html');
  assert.ok(privacidade < catchAll, 'o rewrite precisa vir antes do catch-all');
});
