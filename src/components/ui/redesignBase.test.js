import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Componentes base do redesign (épico #91, issue #87).
const COMPONENTS = Object.freeze([
  'OutlineButton', 'IconBox', 'UniCard', 'DraftCard', 'FilterChips',
  'Segmented', 'Toggle', 'ProgressBar', 'Timeline',
]);

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const jsx = (name) => source(`./${name}/${name}.jsx`);
const css = (name) => source(`./${name}/${name}.module.css`);

test('nenhum componente base usa hex solto: toda cor vem do theme.css', async () => {
  for (const name of COMPONENTS) {
    const [markup, styles] = await Promise.all([jsx(name), css(name)]);
    assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i, `${name}.module.css tem hex solto`);
    assert.doesNotMatch(markup, /#[0-9a-f]{6}\b/i, `${name}.jsx tem hex solto`);
  }
});

test('todo token --uf-app-* usado pelos componentes existe nos temas UniFlow e Claro', async () => {
  const theme = await source('../../styles/theme.css');
  const block = (selector) => {
    let from = 0;
    for (;;) {
      const start = theme.indexOf(selector, from);
      assert.notEqual(start, -1, `bloco ${selector} não encontrado`);
      const body = theme.slice(start, theme.indexOf('}', start));
      if (body.includes('--uf-app-canvas')) return body;
      from = start + selector.length;
    }
  };
  const themes = [block('[data-theme="light"]'), block('[data-theme="uniflow"]')];

  for (const name of COMPONENTS) {
    const used = new Set((await css(name)).match(/--uf-app-[\w-]+/g) ?? []);
    for (const token of used) {
      for (const body of themes) {
        assert.ok(body.includes(`${token}:`), `${name} usa ${token}, que falta num tema`);
      }
    }
  }
});

test('chips e segmented são seleção única com estado acessível', async () => {
  for (const name of ['FilterChips', 'Segmented']) {
    const markup = await jsx(name);
    assert.match(markup, /role="group"/);
    assert.match(markup, /aria-pressed=\{option\.value === value\}/);
    assert.match(markup, /onChange\?\.\(option\.value\)/);
  }
});

test('toggle é um switch acessível e mantém 44px de toque com 40x22 de desenho', async () => {
  const [markup, styles] = await Promise.all([jsx('Toggle'), css('Toggle')]);
  assert.match(markup, /role="switch"/);
  assert.match(markup, /aria-checked=\{checked\}/);
  assert.match(markup, /onChange\?\.\(!checked\)/);
  assert.match(styles, /width: 40px;\s*\n\s*height: 22px;/);
  assert.match(styles, /min-width: 0;\s*\n\s*min-height: 0;/);
  assert.match(styles, /\.toggle::before \{\s*\n\s*position: absolute;\s*\n\s*inset: -11px -2px;/);
});

test('chip pequeno mantém 44px de toque', async () => {
  const styles = await css('FilterChips');
  assert.match(styles, /\.chip::before \{\s*\n\s*position: absolute;\s*\n\s*inset: -9px -3px;/);
});

test('barra de progresso limita o valor entre 0 e 100 e expõe o progresso', async () => {
  const markup = await jsx('ProgressBar');
  assert.match(markup, /Math\.min\(100, Math\.max\(0, Number\(value\) \|\| 0\)\)/);
  assert.match(markup, /role: 'progressbar'/);
  assert.match(markup, /'aria-valuenow': Math\.round\(percent\)/);
  // Sem rótulo, a barra não é anunciada como uma barra sem nome.
  assert.match(markup, /: \{ 'aria-hidden': true \}/);
});

test('rascunho não grava nada sozinho e trava os botões durante a confirmação', async () => {
  const markup = await jsx('DraftCard');
  assert.doesNotMatch(markup, /services\/|supabase|fetch\(|features\//);
  assert.equal(markup.match(/disabled=\{busy\}/g)?.length, 3);
  assert.match(markup, /variant="confirm"[\s\S]*?onClick=\{onConfirm\}/);
  assert.match(markup, /^\s*Confirmar$/m);
  assert.match(markup, />Editar</);
  assert.match(markup, />Cancelar</);
});

test('números da timeline, do rascunho e do card da Uni usam tabular-nums', async () => {
  for (const name of ['Timeline', 'DraftCard', 'UniCard']) {
    assert.match(await css(name), /font-variant-numeric: tabular-nums;/, name);
  }
});

test('avatar volta para as iniciais quando a foto falha (URL assinada vencida)', async () => {
  const avatar = await source('./Avatar/Avatar.jsx');
  assert.match(avatar, /onError=\{\(\) => setFailedSrc\(src\)\}/);
  assert.match(avatar, /const showsImage = Boolean\(src\) && src !== failedSrc;/);
  assert.match(avatar, /\{showsImage \? \(/);
});
