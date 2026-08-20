import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNovidadeUrl, formatUpdateDate, isUpdateSeen, resolvePendingUpdate } from './uniUpdatesData.js';

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
