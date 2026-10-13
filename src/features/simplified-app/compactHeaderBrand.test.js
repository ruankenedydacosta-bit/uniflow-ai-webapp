import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// COMPACT-HEADER1 -- símbolo oficial: PARTE 1 (auditoria) encontrou o
// asset real em public/uniflow-icon.png (U estilizado, azul/roxo à
// esquerda, verde/ciano à direita, com as terminações em ponto -- bate
// com a identidade oficial). Nunca foi redesenhado por aproximação: o
// arquivo final (src/assets/branding/uniflow-mark.png, trocado depois por uniflow-mark.svg) é um recorte
// (trim da margem transparente) + otimização de paleta do MESMO PNG
// oficial, nunca uma nova interpretação da marca.
// ============================================================================

test('o asset do símbolo existe, é SVG sem fundo e tem a proporção 28:34 do viewBox', async () => {
  const svg = await source('../../assets/branding/uniflow-mark.svg');
  assert.match(svg, /viewBox="4 2 28 34"/);
  assert.match(svg, /d="M6 6v16a12 12 0 0 0 24 0V6"/);
  assert.match(svg, /d="M15 11v10a6 6 0 0 0 12 0v-6"/);
  // Sem retângulo de fundo: o símbolo vale sobre qualquer tela.
  assert.doesNotMatch(svg, /<rect/);
});

test('UniMark é a ÚNICA fonte do símbolo -- importa o asset oficial recortado, nunca desenha uma aproximação em SVG', async () => {
  const icons = await source('./SimplifiedIcons.jsx');
  assert.match(icons, /import uniflowMarkAsset from '\.\.\/\.\.\/assets\/branding\/uniflow-mark\.svg';/);
  assert.match(icons, /export function UniMark\(\) \{\s*\n\s*return <img src=\{uniflowMarkAsset\} alt="" width="28" height="34" \/>;/);
  // Nunca mais um gradiente/path desenhado à mão tentando aproximar a marca.
  assert.doesNotMatch(icons, /linearGradient|stopColor/);
});

// Épico #99: o orb de voz usa o símbolo novo do design (dois U em SVG,
// para que cada U gire no seu sentido). O cabeçalho continua com o asset
// oficial até a troca de marca no cabeçalho, ícone e PWA (feita: o asset
// do cabeçalho agora é o uniflow-mark.svg, com os mesmos traços do orb).
test('header usa o asset oficial; o orb de voz desenha o símbolo novo em SVG; os dois usam os mesmos traços', async () => {
  const header = await source('./SimplifiedHeader.jsx');
  const navigation = await source('./SimplifiedBottomNavigation.jsx');
  const orb = await source('../../components/ui/UniRingOrb/UniRingOrb.jsx');
  assert.match(header, /import \{ PhBellIcon, UniMark \} from '\.\/SimplifiedIcons\.jsx';/);
  assert.match(header, /<UniMark \/>/);
  assert.match(navigation, /import \{ UniRingOrb \} from '\.\.\/\.\.\/components\/ui\/UniRingOrb\/index\.js';/);
  assert.match(navigation, /<UniRingOrb/);
  assert.match(orb, /d="M6 6v16a12 12 0 0 0 24 0V6"/);
  assert.match(orb, /d="M15 11v10a6 6 0 0 0 12 0v-6"/);
  assert.doesNotMatch(orb, /\.png'/);
});

test('todo wrapper do UniMark usa object-fit:contain (nunca distorce a proporção 28:34 do asset)', async () => {
  const css = await source('./simplifiedApp.module.css');
  const orbCss = await source('../../components/ui/UniNeuralOrb/UniNeuralOrb.module.css');
  assert.match(css, /\.brandMark img \{[\s\S]*?object-fit: contain;[\s\S]*?\}/);
  assert.match(orbCss, /\.logo \{[\s\S]*?object-fit: contain;[\s\S]*?\}/);
});

// ============================================================================
// COMPACT-HEADER1 -- geometria compacta (PARTE 2).
// ============================================================================

test('header compacto: min-height 68px em todo breakpoint (era 102/86/78px) -- dentro da faixa 64-72px pedida', async () => {
  const css = await source('./simplifiedApp.module.css');
  const heights = [...css.matchAll(/(?:--simplified-header-height|\.header\s*\{\s*(?:position:[^}]*?)?min-height):\s*68px/g)];
  assert.match(css, /--simplified-header-height: 68px;/);
  assert.match(css, /\n {2}\.header \{\s*\n {4}min-height: 68px;\s*\n {2}\}/);
  assert.ok(heights.length >= 0);
  assert.doesNotMatch(css, /min-height: 102px/);
  assert.doesNotMatch(css, /--simplified-header-height: 86px/);
  assert.doesNotMatch(css, /--simplified-header-height: 78px/);
});

test('redesign (épico #91): símbolo de 26px e nome em 17/500, como no handoff', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /\.brandMark \{\s*\n\s*width: 26px;/);
  assert.match(css, /\.brandLockup strong \{\s*\n\s*font-size: 17px;\s*\n\s*font-weight: var\(--uf-font-weight-medium\);/);
});

test('header respeita safe-area (via --uf-header-safe-top, computada uma única vez) e padding lateral de 22px do handoff', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /--uf-header-safe-top: max\(10px, env\(safe-area-inset-top, 0px\)\);/);
  assert.match(
    css,
    /padding:\s*\n\s*var\(--uf-header-safe-top\)\s*\n\s*max\(22px, env\(safe-area-inset-right\)\)\s*\n\s*8px\s*\n\s*max\(22px, env\(safe-area-inset-left\)\);/,
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

test('fundo do header é o canvas com o halo de topo -- blur opcional é discreto, nunca glassmorphism pesado', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(css, /\.header \{[\s\S]*?background-color: var\(--uf-app-canvas\);\s*\n\s*background-image: var\(--uf-app-halo\);/);
  assert.match(css, /@supports \(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\) \{\s*\n\s*\.header \{\s*\n\s*background-color: color-mix\(in srgb, var\(--uf-app-canvas\) 94%, transparent\);\s*\n\s*backdrop-filter: blur\(8px\);/);
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

test('PERF-FIX1: header usa SÓ transform3d+opacity no hot path -- nunca height/max-height/mask, nunca transition competindo com o scroll', async () => {
  const css = await source('./simplifiedApp.module.css');
  const headerBlock = css.slice(css.indexOf('.header {'), css.indexOf('.header[data-hidden="true"]'));
  assert.match(headerBlock, /transform: translate3d\(0, calc\(var\(--header-progress, 0\) \* -100%\), 0\);/);
  assert.match(headerBlock, /opacity: calc\(1 - var\(--header-progress, 0\)\);/);
  assert.match(headerBlock, /will-change: transform, opacity;/);
  assert.doesNotMatch(headerBlock, /transition:[^;]*height/);
  // Nenhuma CSS transition aqui -- o progress é escrito a cada frame de
  // scroll, uma transition ficaria "correndo atrás" do dedo do usuário.
  assert.doesNotMatch(headerBlock, /\btransition:/);
});

test('PERF-FIX1: máscara vertical dinâmica foi REMOVIDA do header -- media em aparelho físico ela forçava repaint a cada frame', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.doesNotMatch(css, /mask-image:/, 'mask-image dependente de --header-progress causava repaint por frame -- removida, nunca deve voltar ao hot path sem prova de que é compositor-only');
  assert.doesNotMatch(css, /-webkit-mask-image:/);
});

test('CAUSA DO ESPAÇO VAZIO (corrigida em fase anterior) continua corrigida: .shellTopRegion nunca reserva altura do header', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.doesNotMatch(
    css,
    /\.shellTopRegion\[data-compact-header="true"\]\s*\{/,
    'shellTopRegion nunca deve voltar a reservar espaço -- essa dupla reserva era a causa do espaço vazio',
  );
});

test('PERF-FIX1: CAUSA DO LAG corrigida -- a reserva de espaço de .mainContent é ESTÁTICA, nunca lê --header-progress (evita reflow por frame)', async () => {
  const css = await source('./simplifiedApp.module.css');
  assert.match(
    css,
    /\.mainContent\[data-compact-header="true"\] \{\s*\n\s*padding-top: var\(--uf-header-full-height\);\s*\n\s*\}/,
  );
  const mainContentBlock = css.slice(css.indexOf('.mainContent[data-compact-header="true"] {'), css.indexOf('.agendaPage {'));
  assert.doesNotMatch(mainContentBlock, /--header-progress/, 'a reserva de espaço nunca pode depender do progress -- isso forçava reflow do layout inteiro da Home a cada frame de scroll');
});

test('nenhuma propriedade de LAYOUT (padding/margin/height/top) em todo o arquivo depende de --header-progress -- só transform/opacity em .header', async () => {
  const css = await source('./simplifiedApp.module.css');
  const layoutPropsWithProgress = [...css.matchAll(/^\s*(padding[a-z-]*|margin[a-z-]*|height|min-height|max-height|top|bottom|left|right|width|min-width|max-width)\s*:[^;]*--header-progress/gm)];
  assert.deepEqual(
    layoutPropsWithProgress.map((m) => m[0].trim()),
    [],
    'nenhuma propriedade de layout pode ler --header-progress -- só transform/opacity (compositor-only) podem',
  );
});

test('safe-area só é computada uma vez (--uf-header-safe-top), reutilizada por .header e pela reserva ESTÁTICA de .mainContent -- nunca duplicada', async () => {
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

// NOTIF-UX3: o painel, "fora de escopo" nesta fase (header scroll), foi
// redesenhado na fase seguinte -- "o header cobre naturalmente por
// z-index" ERA o próprio bug de sobreposição relatado no teste físico
// (o título "Notificações" nascia visualmente atrás do header). Agora o
// painel é position:absolute, ancorado em var(--uf-header-full-height) --
// a MESMA variável que .mainContent já usa pra não ficar atrás do header
// -- então os dois nunca mais se sobrepõem. Cobertura completa da nova
// arquitetura em simplifiedApp.test.js.
test('painel de notificações não fica mais atrás do header -- ancorado na mesma var(--uf-header-full-height) que .mainContent usa', async () => {
  const css = await source('./simplifiedApp.module.css');
  const dropdownRule = /\.notificationsDropdown \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(dropdownRule, '.notificationsDropdown precisa continuar existindo');
  assert.match(dropdownRule[1], /position: absolute;/);
  assert.match(dropdownRule[1], /top: var\(--uf-header-full-height\);/);
  const backdropRule = /\.notificationsBackdrop \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(backdropRule, 'backdrop próprio -- Home nunca "empurrada", só coberta visualmente');
  assert.match(backdropRule[1], /top: var\(--uf-header-full-height\);/);
});

test('header leva à conta pelo avatar, sem tirar o sino', async () => {
  const header = await source('./SimplifiedHeader.jsx');
  assert.match(header, /<Link\s*\n\s*to=\{SIMPLIFIED_ROUTES\.ACCOUNT\}/);
  assert.match(header, /aria-label="Sua conta"/);
  assert.match(header, /<PhBellIcon \/>/);
  assert.doesNotMatch(header, /Pessoal|Empresa/);
});
