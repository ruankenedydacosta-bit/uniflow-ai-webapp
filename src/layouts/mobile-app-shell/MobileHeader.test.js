import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// UX2 -- avatar mobile: MobileHeader precisa aceitar e repassar onAvatarPress
// (achado P0 da UX1: a prop nunca era declarada aqui, entao o botao de avatar,
// mesmo tendo onPress cablado em HeaderAvatar/MobileContextHeader, nunca
// recebia funcao nenhuma -- clique morto).
// ============================================================================

test('MobileHeader aceita onAvatarPress e repassa integralmente para MobileContextHeader', async () => {
  const content = await source('MobileHeader.jsx');
  assert.match(content, /function MobileHeader\(\{[\s\S]*?onAvatarPress,[\s\S]*?\}\)/);
  assert.match(content, /<MobileContextHeader[\s\S]*?onAvatarPress=\{onAvatarPress\}/);
});

test('MobileContextHeader (consumida por MobileHeader) ja suporta onAvatarPress -- confirma que so faltava o repasse', async () => {
  const content = await source('MobileContextHeader.jsx');
  assert.match(content, /onAvatarPress,/);
  assert.match(content, /<HeaderAvatar[\s\S]*?onPress=\{onAvatarPress\}/);
});

// ============================================================================
// UX5 -- identidade clara do espaço ativo: o header mobile mostra o rótulo
// completo do subtitle recebido ("Espaço Pessoal"/"Espaço Empresa"), sem
// truncar para "Pessoal"/"Empresa" sozinho (PF/PJ já aparece como rótulo
// secundário no ContextSegmentedControl ao lado).
// ============================================================================

test('displayName usa o subtitle recebido integralmente, sem truncar "Espaço Pessoal"/"Espaço Empresa" para uma palavra só', async () => {
  const content = await source('MobileHeader.jsx');
  assert.match(content, /const displayName = subtitle \|\| title \|\| 'UniFlow';/);
  assert.doesNotMatch(content, /'Empresa'|'Pessoal'/);
});
