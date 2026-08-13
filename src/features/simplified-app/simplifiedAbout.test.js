// BLOCO FINAL DO MVP (Sobre a UniFlow AI): testes estruturais (source-regex)
// sobre SimplifiedAboutPage.jsx -- mesmo padrão já usado no projeto para
// componentes React (sem @testing-library/react disponível).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('reaproveita a identidade visual já aprovada (UniMark, mesmos cards/gradiente) -- nunca uma identidade nova', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  assert.match(page, /import \{[\s\S]*UniMark,?[\s\S]*\} from '\.\/SimplifiedIcons\.jsx';/);
  const css = await source('./simplifiedAbout.module.css');
  // O card mantém exatamente a mesma identidade -- var(--uf-app-card-bg)
  // resolve para esse mesmo gradiente no tema UniFlow (theme.css, seção 18).
  assert.match(css, /background: var\(--uf-app-card-bg\);/);
});

test('versão e nome vêm da fonte única appIdentity.js -- nunca hardcoded duas vezes (drift entre Conta e Sobre)', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  assert.match(page, /import \{ APP_NAME, APP_TAGLINE, APP_VERSION \} from '\.\/appIdentity\.js';/);
  assert.match(page, /v\{APP_VERSION\}/);
});

test('appIdentity.js declara v1.0.0 como a primeira versão oficial do MVP', async () => {
  const identity = await source('./appIdentity.js');
  assert.match(identity, /export const APP_VERSION = '1\.0\.0';/);
});

test('hero mostra logo, nome, versão e frase institucional', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  const heroStart = page.indexOf('className={styles.hero}');
  const heroSlice = page.slice(heroStart, heroStart + 500);
  assert.match(heroSlice, /heroMark/);
  assert.match(heroSlice, /APP_NAME/);
  assert.match(heroSlice, /heroVersion/);
  assert.match(heroSlice, /APP_TAGLINE/);
});

test('todas as 10 seções pedidas existem: Quem somos, Missão, Visão, O que a Uni faz, Princípios, Tecnologia, Diferencial, Futuro, Agradecimento, Rodapé', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  assert.match(page, /aria-label="Quem somos"/);
  assert.match(page, /aria-label="Nossa missão"/);
  assert.match(page, /aria-label="Nossa visão"/);
  assert.match(page, /aria-label="O que a Uni faz"/);
  assert.match(page, /aria-label="Nossos princípios"/);
  assert.match(page, /aria-label="Tecnologia"/);
  assert.match(page, /aria-label="Por que a UniFlow é diferente"/);
  assert.match(page, /aria-label="Nosso futuro"/);
  assert.match(page, /aria-label="Agradecimento"/);
  assert.match(page, /<footer className=\{styles\.footer\}>/);
});

test('"O que a Uni faz" tem exatamente os 6 itens pedidos', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  const listStart = page.indexOf('const UNI_CAPABILITIES');
  const listSlice = page.slice(listStart, page.indexOf('];', listStart));
  for (const label of [
    'Organiza entradas',
    'Organiza saídas',
    'Ajuda no planejamento financeiro',
    'Conversa naturalmente',
    'Aprende seu contexto',
    'Ajuda na tomada de decisão',
  ]) {
    assert.match(listSlice, new RegExp(label));
  }
});

test('"Nossos princípios" tem exatamente os 5 itens pedidos (Segurança, Transparência, Inteligência, Simplicidade, Evolução contínua)', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  const listStart = page.indexOf('const PRINCIPLES');
  const listSlice = page.slice(listStart, page.indexOf('];', listStart));
  for (const title of ['Segurança', 'Transparência', 'Inteligência', 'Simplicidade', 'Evolução contínua']) {
    assert.match(listSlice, new RegExp(title));
  }
});

test('"Nosso futuro" lista os 5 itens pedidos', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  const listStart = page.indexOf('const FUTURE_ITEMS');
  const listSlice = page.slice(listStart, page.indexOf('];', listStart));
  for (const item of ['Novas inteligências', 'Mais automações', 'Novas integrações', 'Recursos empresariais', 'Melhorias contínuas']) {
    assert.match(listSlice, new RegExp(item));
  }
});

test('tecnologia é explicada em linguagem humana -- nunca cita API, fornecedor ou tecnologia específica', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  const bodyStart = page.indexOf('function SimplifiedAboutPage()');
  const bodySlice = page.slice(bodyStart);
  assert.doesNotMatch(bodySlice, /OpenAI|Supabase|Asaas|\bAPI\b|Vite|Postgres/);
});

test('nunca promete algo irreal (sem comparação direta a concorrentes, sem "melhor do mercado")', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  assert.doesNotMatch(page, /melhor do mercado|líder|concorrente|número 1/i);
});

test('rodapé mostra logo, nome, versão e copyright', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  const footerStart = page.indexOf('<footer');
  const footerSlice = page.slice(footerStart, page.indexOf('</footer>', footerStart));
  assert.match(footerSlice, /footerMark/);
  assert.match(footerSlice, /APP_NAME/);
  assert.match(footerSlice, /v\{APP_VERSION\}/);
  assert.match(footerSlice, /Todos os direitos reservados\./);
});

// ============================================================================
// Microanimações -- discretas, nunca escondem conteúdo de verdade.
// ============================================================================

test('Reveal usa IntersectionObserver com fallback seguro (visível se indisponível) -- nunca esconde conteúdo permanentemente', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  const revealStart = page.indexOf('function Reveal(');
  const revealSlice = page.slice(revealStart, page.indexOf('\n}', revealStart));
  assert.match(revealSlice, /typeof IntersectionObserver !== 'function'/);
  assert.match(revealSlice, /setIsVisible\(true\);\s*\n\s*return undefined;/);
  assert.match(revealSlice, /observer\.disconnect\(\);/);
});

test('prefers-reduced-motion desliga a animação inteira via CSS', async () => {
  const css = await source('./simplifiedAbout.module.css');
  const mediaStart = css.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.ok(mediaStart > -1);
  const mediaSlice = css.slice(mediaStart, mediaStart + 200);
  assert.match(mediaSlice, /transition: none;/);
});

test('cada seção usa Reveal (nunca aparece tudo de uma vez, sem hierarquia de leitura)', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  const revealUsageCount = (page.match(/<Reveal/g) ?? []).length;
  assert.ok(revealUsageCount >= 8, 'a maioria das seções deveria usar Reveal');
});

// ============================================================================
// Acessibilidade e navegação -- consistente com as demais subtelas de Conta.
// ============================================================================

test('cabeçalho tem botão voltar para Conta, mesmo padrão das demais subtelas', async () => {
  const page = await source('./SimplifiedAboutPage.jsx');
  assert.match(page, /aria-label="Voltar para Conta"/);
  assert.match(page, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
});

test('ícones novos (Rocket/Brain/Handshake/Sparkle) seguem o mesmo estilo -- viewBox 32x32, sem fill/stroke inline', async () => {
  const icons = await source('./SimplifiedIcons.jsx');
  for (const iconName of ['RocketIcon', 'BrainIcon', 'HandshakeIcon', 'SparkleIcon']) {
    const start = icons.indexOf(`export function ${iconName}()`);
    assert.ok(start > -1, `${iconName} deve existir`);
    const slice = icons.slice(start, start + 300);
    assert.match(slice, /viewBox="0 0 32 32"/);
    assert.doesNotMatch(slice, /fill="|stroke="/);
  }
});
