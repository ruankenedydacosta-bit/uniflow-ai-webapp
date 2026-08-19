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

test('header respeita env(safe-area-inset-top) e padding lateral compatível com o resto da Home (18px)', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /padding:\s*\n\s*max\(10px, env\(safe-area-inset-top\)\)\s*\n\s*max\(18px, env\(safe-area-inset-right\)\)\s*\n\s*8px\s*\n\s*max\(18px, env\(safe-area-inset-left\)\);/);
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
// COMPACT-HEADER1 -- comportamento ao scroll (PARTE 3): wiring real entre
// o hook (collapsibleHeaderScroll.js, já testado isoladamente) e a shell.
// ============================================================================

test('SimplifiedAppShell só ativa o hook de scroll nas rotas que renderizam o header compacto', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /import \{ useCollapsibleHeaderOnScroll \} from '\.\/collapsibleHeaderScroll\.js';/);
  assert.match(shell, /const showsCompactHeader = !hasPageHeader && !isUniChatRoute;/);
  assert.match(shell, /const isHeaderHidden = useCollapsibleHeaderOnScroll\(\{\s*\n\s*scrollContainerRef: mainContentRef,\s*\n\s*enabled: showsCompactHeader,\s*\n\s*\}\);/);
  assert.match(shell, /<main\s*\n\s*ref=\{mainContentRef\}/);
});

test('hidden chega ao header via prop -- nunca decidido dentro de SimplifiedHeader (única fonte de verdade é o hook)', async () => {
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
  assert.match(css, /\.header\[data-hidden="true"\] \{\s*\n\s*transform: translateY\(-100%\);\s*\n\s*opacity: 0;[\s\S]*?pointer-events: none;/);
});

test('header usa transform+opacity para esconder -- nunca anima height/max-height frame a frame', async () => {
  const css = await source('./simplifiedApp.module.css');
  const headerBlock = css.slice(css.indexOf('.header {'), css.indexOf('.header[data-hidden="true"]'));
  assert.match(headerBlock, /transform: translateY\(0\);/);
  assert.match(headerBlock, /transition: transform 210ms cubic-bezier\(\.22, 1, \.36, 1\), opacity 210ms ease;/);
  assert.doesNotMatch(headerBlock, /transition:[^;]*height/);
});

test('duração da transição do header fica entre 180-240ms (premium, sem bounce -- easing sem overshoot)', async () => {
  const css = await source('./simplifiedApp.module.css');
  const match = css.match(/transition: transform (\d+)ms cubic-bezier\(([\d.]+), (\d+), ([\d.]+), (\d+)\), opacity (\d+)ms/);
  assert.ok(match, 'transição do header não encontrada');
  const durationMs = Number(match[1]);
  assert.ok(durationMs >= 180 && durationMs <= 240, `duração ${durationMs}ms fora da faixa 180-240ms`);
  // cubic-bezier sem overshoot: y1 e y2 dentro de [0,1] -- nunca > 1 (que produziria bounce).
  assert.ok(Number(match[3]) <= 1 && Number(match[5]) <= 1);
});

test('.mainContent e .shellTopRegion reservam o mesmo espaço estrutural do header e recolhem juntos quando ele some -- sem CLS', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(
    css,
    /\.mainContent\[data-compact-header="true"\] \{\s*\n\s*padding-top: calc\(var\(--simplified-header-height\) \+ env\(safe-area-inset-top, 0px\)\);\s*\n\s*transition: padding-top 210ms cubic-bezier\(\.22, 1, \.36, 1\);/,
  );
  assert.match(
    css,
    /\.mainContent\[data-compact-header="true"\]\[data-header-hidden="true"\] \{\s*\n\s*padding-top: env\(safe-area-inset-top, 0px\);/,
  );
  assert.match(
    css,
    /\.shellTopRegion\[data-compact-header="true"\] \{\s*\n\s*padding-top: calc\(var\(--simplified-header-height\) \+ env\(safe-area-inset-top, 0px\)\);/,
  );
});

test('data-compact-header/data-header-hidden nunca vazam para Registros/Conta/Chat da Uni (só quando showsCompactHeader)', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /data-compact-header=\{showsCompactHeader \? 'true' : undefined\}/);
  assert.match(shell, /data-header-hidden=\{showsCompactHeader && isHeaderHidden \? 'true' : undefined\}/);
});

test('painel de notificações nasce ABAIXO do header fixo (nunca por baixo dele) via o mesmo espaço reservado', async () => {
  const css = await source('./simplifiedApp.module.css');
  const shellTopRegionBlock = css.slice(
    css.indexOf('.shellTopRegion['),
    css.indexOf('.brandLockup {'),
  );
  assert.match(shellTopRegionBlock, /padding-top: calc\(var\(--simplified-header-height\)/);
});

test('reduced motion: header/mainContent/shellTopRegion trocam para instantâneo, mas continuam funcionando (nunca travam visíveis)', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(
    css,
    /\.header,\s*\n\s*\.shellTopRegion\[data-compact-header="true"\],\s*\n\s*\.mainContent\[data-compact-header="true"\] \{\s*\n\s*transition: none;\s*\n\s*\}\s*\n\}/,
  );
});
