import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNovidadeUrl,
  compareSemver,
  formatUpdateDate,
  getNextSemver,
  isUpdateSeen,
  parseSemver,
  resolveCurrentVersion,
  resolvePendingUpdate,
} from './uniUpdatesData.js';

const NOW = new Date('2026-08-20T12:00:00Z');

function makeUpdate(overrides = {}) {
  return {
    id: 'update-1',
    version: '1.0.1',
    active: true,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

test('resolvePendingUpdate retorna null sem updates', () => {
  assert.equal(resolvePendingUpdate({ updates: [], now: NOW }), null);
});

test('resolvePendingUpdate ignora update já visto', () => {
  const update = makeUpdate();
  const pending = resolvePendingUpdate({
    updates: [update],
    seenUpdateIds: ['update-1'],
    userCreatedAt: '2026-07-01T00:00:00Z',
    now: NOW,
  });
  assert.equal(pending, null);
});

test('resolvePendingUpdate ignora update inativo', () => {
  const update = makeUpdate({ active: false });
  const pending = resolvePendingUpdate({
    updates: [update],
    userCreatedAt: '2026-07-01T00:00:00Z',
    now: NOW,
  });
  assert.equal(pending, null);
});

test('resolvePendingUpdate ignora update publicado antes do cadastro do usuário -- usuário novo não é incomodado com histórico', () => {
  const update = makeUpdate({ created_at: '2026-07-01T00:00:00Z' });
  const pending = resolvePendingUpdate({
    updates: [update],
    userCreatedAt: '2026-08-15T00:00:00Z',
    now: NOW,
  });
  assert.equal(pending, null);
});

test('resolvePendingUpdate ignora update publicado no futuro (agendado)', () => {
  const update = makeUpdate({ created_at: '2026-09-01T00:00:00Z' });
  const pending = resolvePendingUpdate({
    updates: [update],
    userCreatedAt: '2026-07-01T00:00:00Z',
    now: NOW,
  });
  assert.equal(pending, null);
});

test('resolvePendingUpdate retorna a novidade não vista, publicada após o cadastro', () => {
  const update = makeUpdate();
  const pending = resolvePendingUpdate({
    updates: [update],
    userCreatedAt: '2026-07-01T00:00:00Z',
    now: NOW,
  });
  assert.equal(pending?.id, 'update-1');
});

test('resolvePendingUpdate retorna a mais recente entre múltiplas pendentes', () => {
  const older = makeUpdate({ id: 'update-old', created_at: '2026-08-01T00:00:00Z' });
  const newer = makeUpdate({ id: 'update-new', created_at: '2026-08-10T00:00:00Z' });
  const pending = resolvePendingUpdate({
    updates: [older, newer],
    userCreatedAt: '2026-07-01T00:00:00Z',
    now: NOW,
  });
  assert.equal(pending?.id, 'update-new');
});

test('formatUpdateDate formata dd/mm/aaaa com ano completo', () => {
  assert.equal(formatUpdateDate('2026-08-20T12:00:00Z'), '20/08/2026');
});

test('formatUpdateDate retorna vazio para valor ausente ou inválido', () => {
  assert.equal(formatUpdateDate(null), '');
  assert.equal(formatUpdateDate('not-a-date'), '');
});

test('isUpdateSeen reflete a lista de ids vistos', () => {
  const update = makeUpdate();
  assert.equal(isUpdateSeen(update, []), false);
  assert.equal(isUpdateSeen(update, ['update-1']), true);
  assert.equal(isUpdateSeen(null, ['update-1']), false);
});

test('buildNovidadeUrl aponta para Sobre a UniFlow AI com ?novidade=<id> -- mesmo alvo da notificação e do botão "Ver novidades"', () => {
  assert.equal(buildNovidadeUrl('update-123'), '/app/conta/sobre?novidade=update-123');
});

// ============================================================================
// UNIUPD2 -- versionamento semântico obrigatório (mesma regra replicada
// na migration 046, em SQL, para o banco ser a fonte real de verdade).
// ============================================================================

test('parseSemver extrai major/minor/patch de uma versão válida', () => {
  assert.deepEqual(parseSemver('1.0.9'), { major: 1, minor: 0, patch: 9 });
  assert.deepEqual(parseSemver('12.34.56'), { major: 12, minor: 34, patch: 56 });
});

test('parseSemver retorna null para valores inválidos', () => {
  assert.equal(parseSemver('1.0'), null);
  assert.equal(parseSemver('1.0.0-beta'), null);
  assert.equal(parseSemver(null), null);
  assert.equal(parseSemver(undefined), null);
});

test('compareSemver compara numericamente, nunca como string ("1.0.10" > "1.0.9")', () => {
  assert.ok(compareSemver('1.0.10', '1.0.9') > 0);
  assert.ok(compareSemver('1.0.9', '1.0.10') < 0);
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
  assert.ok(compareSemver('1.1.0', '1.0.9') > 0);
  assert.ok(compareSemver('2.0.0', '1.9.9') > 0);
});

test('getNextSemver incrementa o patch normalmente (1.0.1 -> 1.0.2)', () => {
  assert.equal(getNextSemver('1.0.1'), '1.0.2');
});

test('getNextSemver vira minor quando patch chega a 9 (1.0.9 -> 1.1.0), nunca 1.0.10', () => {
  assert.equal(getNextSemver('1.0.9'), '1.1.0');
});

test('getNextSemver vira major quando minor e patch chegam a 9 (1.9.9 -> 2.0.0)', () => {
  assert.equal(getNextSemver('1.9.9'), '2.0.0');
});

test('getNextSemver segue a sequência completa pedida: 1.0.1 até 1.0.9, depois 1.1.0', () => {
  let version = '1.0.0';
  const sequence = [];
  for (let i = 0; i < 10; i += 1) {
    version = getNextSemver(version);
    sequence.push(version);
  }
  assert.deepEqual(sequence, [
    '1.0.1', '1.0.2', '1.0.3', '1.0.4', '1.0.5',
    '1.0.6', '1.0.7', '1.0.8', '1.0.9', '1.1.0',
  ]);
});

test('getNextSemver retorna null para versão atual inválida', () => {
  assert.equal(getNextSemver('não é versão'), null);
});

test('resolveCurrentVersion usa a versão da novidade mais recente (updates[0], já ordenado created_at desc)', () => {
  const updates = [{ version: '1.0.3' }, { version: '1.0.2' }, { version: '1.0.1' }];
  assert.equal(resolveCurrentVersion(updates, '1.0.0'), '1.0.3');
});

test('resolveCurrentVersion cai no fallback quando não há nenhuma novidade publicada ainda', () => {
  assert.equal(resolveCurrentVersion([], '1.0.0'), '1.0.0');
  assert.equal(resolveCurrentVersion(undefined, '1.0.0'), '1.0.0');
});
