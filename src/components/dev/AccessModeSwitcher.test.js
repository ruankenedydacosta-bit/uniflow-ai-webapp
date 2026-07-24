import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// UX3 -- AccessModeSwitcher nao deve mais competir com o AccountMenu (Topbar)
// como fonte de identidade: removido o nome fixo "UniFlow Demo"; PF/PJ e
// funcao de plano/modo de uso continuam intactas.
// ============================================================================

test('nunca renderiza o nome fictício "UniFlow Demo"', async () => {
  const content = await source('AccessModeSwitcher.jsx');
  assert.doesNotMatch(content, /UniFlow Demo/);
});

test('trigger tem aria-label descrevendo o contexto de acesso, nao mais um nome de usuario', async () => {
  const content = await source('AccessModeSwitcher.jsx');
  assert.match(content, /aria-label=\{`Contexto de acesso: \$\{accessSummary\}`\}/);
});

test('seletor de Plano/Modo de uso/Espaço atual continua funcional e intacto (PF/PJ preservado)', async () => {
  const content = await source('AccessModeSwitcher.jsx');
  assert.match(content, /handlePlanChange/);
  assert.match(content, /handleUserModeChange/);
  assert.match(content, /handleWorkspaceChange/);
  assert.match(content, /canChooseWorkspace = access\.userMode === USER_MODES\.BOTH;/);
});

test('nao duplica nome/e-mail do usuario (identidade e responsabilidade exclusiva do AccountMenu)', async () => {
  const content = await source('AccessModeSwitcher.jsx');
  assert.doesNotMatch(content, /profileName|profileEmail|user\?\.email|user\?\.id/);
});

test('CSS nao possui mais as regras orfas .profileText/.profileName removidas junto com o texto fixo', async () => {
  const css = await source('AccessModeSwitcher.module.css');
  assert.doesNotMatch(css, /\.profileText\s*\{/);
  assert.doesNotMatch(css, /\.profileName\s*\{/);
});
