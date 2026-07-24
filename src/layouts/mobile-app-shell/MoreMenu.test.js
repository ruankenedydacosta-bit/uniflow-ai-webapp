import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// UX2 -- MoreMenu.jsx: grupo "Gestão" e itens comingSoon (Notificações/Suporte)
// ============================================================================

test('MoreMenu renderiza o grupo "Gestão" a partir de managementItems, mesmo padrao dos demais grupos', async () => {
  const content = await source('MoreMenu.jsx');
  assert.match(content, /const managementItems = visibleItems\.filter\(\(item\) => item\.group === 'management'\);/);
  assert.match(content, /<h3 id="more-management-title" className=\{styles\.drawerGroupTitle\}>Gestão<\/h3>/);
  assert.match(content, /\{managementItems\.map\(renderItem\)\}/);
});

test('grupo Gestão usa a mesma filterShellRoutesByContext (visibleItems) que os demais grupos -- sem lista paralela', async () => {
  const content = await source('MoreMenu.jsx');
  const managementBlock = content.slice(
    content.indexOf('const managementItems'),
    content.indexOf('const productItems'),
  );
  assert.match(managementBlock, /visibleItems\.filter/);
});

test('itens comingSoon renderizam <button disabled> com "Em breve", nunca chamam handleItem (sem onNavigate/onAction)', async () => {
  const content = await source('MoreMenu.jsx');
  const disabledBranch = content.slice(
    content.indexOf('if (item.comingSoon) {'),
    content.indexOf('const isActive = Boolean(item.path)'),
  );
  assert.match(disabledBranch, /disabled\s*\n\s*aria-disabled="true"/);
  assert.match(disabledBranch, /Em breve/);
  assert.doesNotMatch(disabledBranch, /onClick/);
  assert.doesNotMatch(disabledBranch, /handleItem/);
});

test('itens normais (nao comingSoon) continuam chamando handleItem normalmente ao clicar', async () => {
  const content = await source('MoreMenu.jsx');
  const normalBranch = content.slice(
    content.indexOf('const isActive = Boolean(item.path)'),
    content.lastIndexOf('};'),
  );
  assert.match(normalBranch, /onClick=\{\(\) => handleItem\(item\)\}/);
});

test('item ativo (rota atual) recebe destaque visual e aria-current="page"', async () => {
  const content = await source('MoreMenu.jsx');
  assert.match(content, /import \{ useLocation \} from 'react-router-dom';/);
  assert.match(content, /const isActive = Boolean\(item\.path\) && location\.pathname === item\.path;/);
  assert.match(content, /aria-current=\{isActive \? 'page' : undefined\}/);
});
