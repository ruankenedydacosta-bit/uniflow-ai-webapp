// Prerender das páginas legais. Roda depois do `vite build` e grava
// dist/privacidade/index.html com o texto inteiro dentro de #root, a partir
// do mesmo componente React que o app renderiza na rota.
//
// Sem isto, /privacidade cai no rewrite para o index.html e serve o shell
// vazio a quem não roda JavaScript: o revisor do Google OAuth e das lojas.
// Humano e robô recebem o mesmo HTML (prerender, não middleware de robô).
//
// Falha de propósito: se a página não renderizar, o build quebra. Um aviso
// silencioso devolveria a página vazia ao revisor com o build verde.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

export const LEGAL_ROUTES = [
  {
    url: '/privacidade',
    file: 'privacidade/index.html',
    module: '/src/features/legal/PrivacidadePage.jsx',
    metaModule: '/src/features/legal/politicaDePrivacidade.js',
  },
];

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

// Carrega o componente pelo Vite em modo SSR (CSS Modules e JSX resolvidos
// como no app) e devolve o HTML do componente e os metadados da página.
export async function renderLegalRoutes() {
  const { createServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const { createElement } = await import('react');
  const { renderToString } = await import('react-dom/server');

  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    plugins: [react()],
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  });

  try {
    const pages = [];
    for (const route of LEGAL_ROUTES) {
      const page = await server.ssrLoadModule(route.module);
      const { PAGE_META } = await server.ssrLoadModule(route.metaModule);
      const html = renderToString(createElement(page.default));
      pages.push({ ...route, html, meta: PAGE_META });
    }
    return pages;
  } finally {
    await server.close();
  }
}

export function injectIntoShell(shell, { html, meta, url }) {
  const head = [
    `<title>${escapeAttribute(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttribute(meta.description)}" />`,
    // Sem JavaScript, nada remove a splash, e ela cobriria o texto.
    '<noscript><style>#uniflow-splash { display: none; }</style></noscript>',
  ].join('\n    ');

  const output = shell
    .replace('<html lang="en">', '<html lang="pt-BR">')
    .replace(/<title>[\s\S]*?<\/title>/, head)
    .replace('<div id="root"></div>', () => `<div id="root">${html}</div>`);

  if (!output.includes(html)) {
    throw new Error(`prerender-legal: #root não encontrado no index.html para ${url}`);
  }
  return output;
}

async function main() {
  const shell = await readFile(resolve(DIST, 'index.html'), 'utf8');
  const pages = await renderLegalRoutes();

  for (const page of pages) {
    const target = resolve(DIST, page.file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, injectIntoShell(shell, page));
    console.log(`prerender-legal: ${page.url} -> dist/${page.file}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
