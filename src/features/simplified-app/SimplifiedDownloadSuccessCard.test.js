import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// DOWNLOAD-SUCCESS1 -- card de sucesso com identidade Uni dentro da tela do
// Relatório. Componente React sem Testing Library no repositório:
// cobertura estrutural por leitura de fonte (mesmo padrão de
// SimplifiedReportCard.test.js). A lógica de verdade (capacidade de abrir)
// mora em downloadedFileShare.js e é testada por comportamento lá.
// ============================================================================

test('mostra exatamente a mensagem de sucesso pedida', async () => {
  const card = await source('./SimplifiedDownloadSuccessCard.jsx');
  assert.match(card, /Relatório baixado com sucesso/);
});

test('identidade Uni: usa UniMark e o selo de check -- nunca um alerta genérico do navegador', async () => {
  const card = await source('./SimplifiedDownloadSuccessCard.jsx');
  assert.match(card, /import \{ CheckIcon, UniMark \} from '\.\/SimplifiedIcons\.jsx';/);
  assert.match(card, /<UniMark \/>/);
  assert.match(card, /<CheckIcon \/>/);
});

test('"Abrir arquivo" só é RENDERIZADO quando a capacidade real existe -- nunca um botão morto', async () => {
  const card = await source('./SimplifiedDownloadSuccessCard.jsx');
  assert.match(card, /\{canOpen \? \(/);
  assert.match(card, /Abrir arquivo/);
  const openBlock = card.slice(card.indexOf('{canOpen ? ('), card.indexOf(') : null}', card.indexOf('{canOpen ? (')));
  assert.match(openBlock, /onClick=\{onOpen\}/);
});

test('canOpen nasce false -- sem a capacidade comprovada, o botão nunca aparece por acidente', async () => {
  const card = await source('./SimplifiedDownloadSuccessCard.jsx');
  assert.match(card, /canOpen = false/);
});

test('componente é PURO: nenhum estado, nenhuma detecção de capacidade dentro dele', async () => {
  const card = await source('./SimplifiedDownloadSuccessCard.jsx');
  assert.doesNotMatch(card, /useState|useEffect|navigator|canShare/);
});

test('é anunciado por leitor de tela como status, sem roubar foco', async () => {
  const card = await source('./SimplifiedDownloadSuccessCard.jsx');
  assert.match(card, /role="status"/);
  assert.match(card, /aria-live="polite"/);
});

test('deixa claro que o arquivo já está salvo -- o download nativo continua sendo o caminho garantido', async () => {
  const card = await source('./SimplifiedDownloadSuccessCard.jsx');
  assert.match(card, /O arquivo já está salvo no seu dispositivo\./);
});

test('CSS usa só tokens semânticos --uf-app-*, nunca hex fixo -- acompanha UniFlow e Claro sozinho', async () => {
  const css = await source('./simplifiedDownloadSuccessCard.module.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(css, /var\(--uf-app-/);
});

test('botão Abrir arquivo respeita 44px de toque e foco visível', async () => {
  const css = await source('./simplifiedDownloadSuccessCard.module.css');
  const button = css.slice(css.indexOf('.openButton {'), css.indexOf('@media (max-width'));
  assert.match(button, /min-height: 44px;/);
  assert.match(button, /:focus-visible/);
});

// SHARE-TRUTHFUL1: falhar em ABRIR não é um erro para o usuário -- o
// download já deu certo e o arquivo está salvo. O card nunca acusa erro:
// o chamador apenas para de passar canOpen e some o botão.
test('card não tem nenhum estado/slot de erro -- falhar em abrir nunca vira mensagem de erro', async () => {
  const card = await source('./SimplifiedDownloadSuccessCard.jsx');
  assert.doesNotMatch(card, /openError|role="alert"/);
  const css = await source('./simplifiedDownloadSuccessCard.module.css');
  assert.doesNotMatch(css, /openError/);
});

// REGRESSÃO (pego em verificação visual, invisível para teste estrutural):
// UniMark renderiza um <img> com width/height intrínsecos de 463x512. Com
// a regra cobrindo só `svg`, a marca estourava a célula de 44px e cobria a
// tela inteira. A regra PRECISA dimensionar o img.
test('a marca da Uni é dimensionada como <img> também -- nunca renderiza no tamanho intrínseco (463x512)', async () => {
  const css = await source('./simplifiedDownloadSuccessCard.module.css');
  assert.match(css, /\.mark img,\s*\n\.mark svg \{[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
});

test('nome longo de arquivo nunca cria scroll lateral', async () => {
  const css = await source('./simplifiedDownloadSuccessCard.module.css');
  assert.match(css, /\.filename \{[\s\S]*?overflow-wrap: anywhere;/);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)/);
});

test('respeita prefers-reduced-motion (entrada e toque)', async () => {
  const css = await source('./simplifiedDownloadSuccessCard.module.css');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /animation: none;/);
  assert.match(reduced, /transition: none;/);
});

test('cabe em 320px -- empilha em telas muito estreitas', async () => {
  const css = await source('./simplifiedDownloadSuccessCard.module.css');
  assert.match(css, /@media \(max-width: 359px\)/);
});
