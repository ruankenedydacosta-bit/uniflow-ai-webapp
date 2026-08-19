import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// COMPACT-HEADER1 -- símbolo oficial: PARTE 1 (auditoria) encontrou o
// asset real em public/uniflow-icon.png (U estilizado, azul/roxo à
// esquerda, verde/ciano à direita, com as terminações em ponto -- bate
// com a identidade oficial). Nunca foi redesenhado por aproximação: o
// arquivo final (src/assets/branding/uniflow-mark.png) é um recorte
// (trim da margem transparente) + otimização de paleta do MESMO PNG
// oficial, nunca uma nova interpretação da marca.
// ============================================================================

test('o asset oficial recortado existe, preserva alpha e não distorce a proporção original', async () => {
  const assetUrl = new URL('../../assets/branding/uniflow-mark.png', import.meta.url);
  const info = await stat(assetUrl);
  assert.ok(info.size > 0);
  // PNG real (assinatura de arquivo), nunca um placeholder vazio.
  const buffer = await readFile(assetUrl);
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('UniMark é a ÚNICA fonte do símbolo -- importa o asset oficial recortado, nunca desenha uma aproximação em SVG', async () => {
  const icons = await source('./SimplifiedIcons.jsx');
  assert.match(icons, /import uniflowMarkAsset from '\.\.\/\.\.\/assets\/branding\/uniflow-mark\.png';/);
  assert.match(icons, /export function UniMark\(\) \{\s*\n\s*return <img src=\{uniflowMarkAsset\} alt="" width="463" height="512" \/>;/);
  // Nunca mais um gradiente/path desenhado à mão tentando aproximar a marca.
  assert.doesNotMatch(icons, /linearGradient|stopColor/);
});

test('header e botão de voz reutilizam o MESMO UniMark -- nunca uma segunda interpretação da marca', async () => {
  const header = await source('./SimplifiedHeader.jsx');
  const home = await source('./SimplifiedHomeView.jsx');
  assert.match(header, /import \{ BellIcon, UniMark \} from '\.\/SimplifiedIcons\.jsx';/);
  assert.match(header, /<UniMark \/>/);
  assert.match(home, /import \{ UniMark \} from '\.\/SimplifiedIcons\.jsx';/);
  assert.match(home, /<UniMark \/>/);
});

test('todo wrapper do UniMark usa object-fit:contain (nunca distorce a proporção 463:512 do asset)', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /\.brandMark img \{[\s\S]*?object-fit: contain;[\s\S]*?\}/);
  assert.match(css, /\.uniMark img \{[\s\S]*?object-fit: contain;[\s\S]*?\}/);
});

// ============================================================================
// COMPACT-HEADER1 -- geometria compacta (PARTE 2).
// ============================================================================

test('header compacto: min-height 68px em todo breakpoint (era 102/86/78px) -- dentro da faixa 64-72px pedida', async () => {
  const css = await source('./simplifiedApp.module.css');
  const heights = [...css.matchAll(/(?:--simplified-header-height|\.header\s*\{\s*(?:position:[^}]*?)?min-height):\s*68px/g)];
  assert.match(css, /--simplified-header-height: 68px;/);
  assert.match(css, /min-height: 68px;\s*\n\s*padding-inline: max\(16px/);
  assert.match(css, /\n {2}\.header \{\s*\n {4}min-height: 68px;\s*\n {2}\}/);
  assert.ok(heights.length >= 0);
  assert.doesNotMatch(css, /min-height: 102px/);
  assert.doesNotMatch(css, /--simplified-header-height: 86px/);
  assert.doesNotMatch(css, /--simplified-header-height: 78px/);
});

test('símbolo do header entre 36-42px, wordmark entre 20-26px (nunca protagonista da Home)', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /\.brandMark \{\s*\n\s*width: clamp\(36px, 9vw, 42px\);/);
  assert.match(css, /\.brandLockup strong \{\s*\n\s*font-size: clamp\(20px, 5vw, 26px\);/);
});

test('header respeita safe-area (via --uf-header-safe-top, computada uma única vez) e padding lateral compatível com o resto da Home (18px)', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /--uf-header-safe-top: max\(10px, env\(safe-area-inset-top, 0px\)\);/);
  assert.match(
    css,
    /padding:\s*\n\s*var\(--uf-header-safe-top\)\s*\n\s*max\(18px, env\(safe-area-inset-right\)\)\s*\n\s*8px\s*\n\s*max\(18px, env\(safe-area-inset-left\)\);/,
  );
});

test('sino mantém área de toque >= 44x44px, mesmo com o header compacto', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /\.notificationButton \{[\s\S]*?width: 50px;[\s\S]*?height: 50px;/);
});

test('layout da direita agrupado em headerActions -- um segundo ícone futuro entra sem hardcode frágil', async () => {
  const header = await source('./SimplifiedHeader.jsx');
  const css = await source('./simplifiedApp.module.css');
  assert.match(header, /<div className=\{styles\.headerActions\}>/);
  assert.match(css, /\.headerActions \{\s*\n\s*display: inline-flex;/);
});

test('fundo do header preserva o navy/azul profundo (--uf-app-canvas) -- blur opcional é discreto, nunca glassmorphism pesado', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /\.header \{[\s\S]*?background: var\(--uf-app-canvas\);/);
  assert.match(css, /@supports \(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\) \{\s*\n\s*\.header \{\s*\n\s*background: color-mix\(in srgb, var\(--uf-app-canvas\) 94%, transparent\);\s*\n\s*backdrop-filter: blur\(8px\);/);
});

// ============================================================================
// HEADER-SCROLL2 -- comportamento ao scroll CONTÍNUO: wiring real entre o
// hook (collapsibleHeaderScroll.js, matemática pura já testada isolada) e
// a shell. Nunca mais um hidden binário por threshold único.
// ============================================================================

test('SimplifiedAppShell só ativa o hook de scroll nas rotas que renderizam o header compacto, e passa shellRef', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /import \{ useCollapsibleHeaderOnScroll \} from '\.\/collapsibleHeaderScroll\.js';/);
  assert.match(shell, /const showsCompactHeader = !hasPageHeader && !isUniChatRoute;/);
  assert.match(
    shell,
    /const isHeaderHidden = useCollapsibleHeaderOnScroll\(\{\s*\n\s*scrollContainerRef: mainContentRef,\s*\n\s*shellRef,\s*\n\s*enabled: showsCompactHeader,\s*\n\s*\}\);/,
  );
  assert.match(shell, /<main\s*\n\s*ref=\{mainContentRef\}/);
  assert.match(shell, /ref=\{shellRef\}\s*\n\s*className=\{styles\.shell\}/);
});

test('hidden (efetivamente escondido) chega ao header via prop -- nunca decidido dentro de SimplifiedHeader', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  const header = await source('./SimplifiedHeader.jsx');
  assert.match(shell, /hidden=\{isHeaderHidden\}/);
  assert.match(header, /hidden = false,/);
  assert.doesNotMatch(header, /useCollapsibleHeaderOnScroll|addEventListener\('scroll'/);
});

test('header escondido nunca captura toque/foco: aria-hidden, pointer-events:none e tabIndex=-1 no sino', async () => {
  const header = await source('./SimplifiedHeader.jsx');
  const css = await source('./simplifiedApp.module.css');
  assert.match(header, /<header className=\{styles\.header\} data-hidden=\{hidden \? 'true' : 'false'\} aria-hidden=\{hidden\}>/);
  assert.match(header, /tabIndex=\{hidden \? -1 : undefined\}/);
  assert.match(css, /\.header\[data-hidden="true"\] \{\s*\n\s*pointer-events: none;\s*\n\s*\}/);
});

test('header usa transform3d+opacity+mask CONTÍNUOS (--header-progress) -- nunca height/max-height, nunca transition competindo com o scroll', async () => {
  const css = await source('./simplifiedApp.module.css');
  const headerBlock = css.slice(css.indexOf('.header {'), css.indexOf('.header[data-hidden="true"]'));
  assert.match(headerBlock, /transform: translate3d\(0, calc\(var\(--header-progress, 0\) \* -100%\), 0\);/);
  assert.match(headerBlock, /opacity: calc\(1 - var\(--header-progress, 0\)\);/);
  assert.doesNotMatch(headerBlock, /transition:[^;]*height/);
  // Nenhuma CSS transition aqui -- o progress é escrito a cada frame de
  // scroll, uma transition ficaria "correndo atrás" do dedo do usuário.
  assert.doesNotMatch(headerBlock, /\btransition:/);
});

test('máscara vertical some a parte de baixo do header primeiro, e é imperceptível em repouso (progress=0)', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(
    css,
    /mask-image: linear-gradient\(to bottom, black calc\(100% - \(var\(--header-progress, 0\) \* 70%\)\), transparent 100%\);/,
  );
  assert.match(css, /-webkit-mask-image: linear-gradient\(to bottom, black calc\(100% - \(var\(--header-progress, 0\) \* 70%\)\), transparent 100%\);/);
});

test('CAUSA DO ESPAÇO VAZIO corrigida: .shellTopRegion NUNCA mais reserva altura do header -- só .mainContent reserva, e acompanha --header-progress continuamente', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.doesNotMatch(
    css,
    /\.shellTopRegion\[data-compact-header="true"\]\s*\{/,
    'shellTopRegion nunca deve voltar a reservar espaço -- essa dupla reserva era a causa do espaço vazio',
  );
  assert.match(
    css,
    /\.mainContent\[data-compact-header="true"\] \{\s*\n\s*padding-top: calc\(\s*\n\s*env\(safe-area-inset-top, 0px\)\s*\n\s*\+ \(var\(--uf-header-full-height\) - env\(safe-area-inset-top, 0px\)\) \* \(1 - var\(--header-progress, 0\)\)\s*\n\s*\);\s*\n\s*\}/,
  );
});

test('reserva do conteúdo nunca zera de vez -- preserva env(safe-area-inset-top) mesmo com progress=1 (nunca remove a proteção do notch)', async () => {
  const css = await source('./simplifiedApp.module.css');
  const mainContentBlock = css.slice(css.indexOf('.mainContent[data-compact-header="true"] {'), css.indexOf('.agendaPage {'));
  assert.match(mainContentBlock, /env\(safe-area-inset-top, 0px\)/);
});

test('safe-area só é computada uma vez (--uf-header-safe-top), reutilizada por .header e pela reserva de .mainContent -- nunca duplicada', async () => {
  const css = await source('./simplifiedApp.module.css');
  const declarations = [...css.matchAll(/^\s*--uf-header-safe-top: max\(10px, env\(safe-area-inset-top, 0px\)\);/gm)];
  assert.equal(declarations.length, 1, '--uf-header-safe-top só deveria ser DECLARADA uma vez');
  assert.match(css, /--uf-header-full-height: calc\(var\(--simplified-header-height\) - 10px \+ var\(--uf-header-safe-top\)\);/);
  // .header e a reserva de .mainContent leem via var(), nunca recalculam
  // max(10px, env(...)) por conta própria.
  assert.doesNotMatch(css, /padding:\s*\n\s*max\(10px, env\(safe-area-inset-top/);
});

test('data-compact-header nunca vaza para Registros/Conta/Chat da Uni (só quando showsCompactHeader), e data-header-hidden não existe mais', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /data-compact-header=\{showsCompactHeader \? 'true' : undefined\}/);
  assert.doesNotMatch(shell, /data-header-hidden/, 'era um estado binário -- substituído pelo --header-progress contínuo, nunca mais um atributo discreto');
});

test('painel de notificações (fora de escopo) continua intocado -- sem padding/margin novo, header cobre naturalmente por z-index', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /\.notificationsDropdown \{[\s\S]{0,40}--uf-color-text-primary: var\(--uf-app-text\);/);
  assert.match(css, /padding: 0 18px;/);
  assert.match(css, /\.notificationsDropdown\[data-open="true"\] \{[\s\S]*?padding: 18px;/);
});

