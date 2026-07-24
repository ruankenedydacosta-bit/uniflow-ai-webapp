import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NOTIFICATION_TYPES,
  countUnread,
  formatNotificationDate,
  getNotificationTypeLabel,
  isNotificationUnread,
  isSafeInternalUrl,
} from './notificationFormatting.js';

// ============================================================================
// NOTIF1 -- isSafeInternalUrl: unica barreira de app entre um action_url
// vindo do banco e uma navegacao real. So permite rota interna relativa;
// bloqueia qualquer URL externa arbitraria.
// ============================================================================

test('isSafeInternalUrl aceita rota interna simples', () => {
  assert.equal(isSafeInternalUrl('/objetivos'), true);
  assert.equal(isSafeInternalUrl('/financeiro'), true);
});

test('isSafeInternalUrl bloqueia URL absoluta http(s)', () => {
  assert.equal(isSafeInternalUrl('https://evil.example.com'), false);
  assert.equal(isSafeInternalUrl('http://evil.example.com'), false);
});

test('isSafeInternalUrl bloqueia protocol-relative ("//")', () => {
  assert.equal(isSafeInternalUrl('//evil.example.com'), false);
});

test('isSafeInternalUrl bloqueia esquemas nao-http (javascript:, mailto:, etc.)', () => {
  assert.equal(isSafeInternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeInternalUrl('mailto:a@b.com'), false);
});

test('isSafeInternalUrl bloqueia valores vazios, nulos ou nao-string', () => {
  assert.equal(isSafeInternalUrl(null), false);
  assert.equal(isSafeInternalUrl(undefined), false);
  assert.equal(isSafeInternalUrl(''), false);
  assert.equal(isSafeInternalUrl(42), false);
  assert.equal(isSafeInternalUrl({}), false);
});

test('isSafeInternalUrl bloqueia rota relativa sem barra inicial', () => {
  assert.equal(isSafeInternalUrl('objetivos'), false);
});

// ============================================================================
// countUnread / isNotificationUnread
// ============================================================================

test('isNotificationUnread e true quando read_at e nulo/ausente', () => {
  assert.equal(isNotificationUnread({ read_at: null }), true);
  assert.equal(isNotificationUnread({}), true);
});

test('isNotificationUnread e false quando read_at esta preenchido', () => {
  assert.equal(isNotificationUnread({ read_at: '2026-07-24T12:00:00Z' }), false);
});

test('countUnread conta apenas as nao lidas', () => {
  const notifications = [
    { id: '1', read_at: null },
    { id: '2', read_at: '2026-07-24T12:00:00Z' },
    { id: '3', read_at: null },
  ];
  assert.equal(countUnread(notifications), 2);
});

test('countUnread retorna 0 para lista vazia', () => {
  assert.equal(countUnread([]), 0);
  assert.equal(countUnread(), 0);
});

// ============================================================================
// getNotificationTypeLabel / NOTIFICATION_TYPES
// ============================================================================

test('NOTIFICATION_TYPES cobre os 6 tipos suportados pela NOTIF1', () => {
  assert.deepEqual(
    [...NOTIFICATION_TYPES].sort(),
    ['agenda', 'crm', 'financeiro', 'metas', 'sistema', 'uni'].sort(),
  );
});

test('getNotificationTypeLabel traduz cada tipo suportado', () => {
  assert.equal(getNotificationTypeLabel('financeiro'), 'Financeiro');
  assert.equal(getNotificationTypeLabel('metas'), 'Metas');
  assert.equal(getNotificationTypeLabel('agenda'), 'Agenda');
  assert.equal(getNotificationTypeLabel('crm'), 'CRM');
  assert.equal(getNotificationTypeLabel('sistema'), 'Sistema');
  assert.equal(getNotificationTypeLabel('uni'), 'Uni');
});

test('getNotificationTypeLabel cai em "Sistema" para tipo desconhecido, nunca lanca', () => {
  assert.equal(getNotificationTypeLabel('tipo-invalido'), 'Sistema');
  assert.equal(getNotificationTypeLabel(undefined), 'Sistema');
});

// ============================================================================
// formatNotificationDate
// ============================================================================

test('formatNotificationDate mostra hora quando e hoje', () => {
  const now = new Date('2026-07-24T15:30:00');
  const createdAt = new Date('2026-07-24T10:00:00').toISOString();
  const result = formatNotificationDate(createdAt, now);
  assert.match(result, /^\d{2}:\d{2}$/);
});

test('formatNotificationDate mostra "Ontem" para o dia anterior', () => {
  const now = new Date('2026-07-24T15:30:00');
  const createdAt = new Date('2026-07-23T10:00:00').toISOString();
  assert.equal(formatNotificationDate(createdAt, now), 'Ontem');
});

test('formatNotificationDate mostra dd/mm para datas mais antigas', () => {
  const now = new Date('2026-07-24T15:30:00');
  const createdAt = new Date('2026-07-01T10:00:00').toISOString();
  assert.equal(formatNotificationDate(createdAt, now), '01/07');
});

test('formatNotificationDate retorna string vazia para entrada ausente ou invalida', () => {
  assert.equal(formatNotificationDate(null), '');
  assert.equal(formatNotificationDate(undefined), '');
  assert.equal(formatNotificationDate('nao-e-uma-data'), '');
});
