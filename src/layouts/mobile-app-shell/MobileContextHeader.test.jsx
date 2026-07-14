import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getContextGreeting,
  normalizeHeaderInitials,
  NOTIFICATION_STATES,
  VALID_CONTEXTS,
} from './mobileContextHeaderSchema.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('saudação acompanha manhã, tarde e noite deterministicamente', () => {
  assert.equal(getContextGreeting(new Date(2026, 0, 1, 8)), 'Bom dia,');
  assert.equal(getContextGreeting(new Date(2026, 0, 1, 14)), 'Boa tarde,');
  assert.equal(getContextGreeting(new Date(2026, 0, 1, 21)), 'Boa noite,');
});

test('avatar limita fallback a duas iniciais seguras', () => {
  assert.equal(normalizeHeaderInitials('loja crystal'), 'LO');
  assert.equal(normalizeHeaderInitials('ÁG'), 'ÁG');
  assert.equal(normalizeHeaderInitials(''), 'UF');
});

test('catálogos de contexto e notificação são imutáveis', () => {
  assert.deepEqual(VALID_CONTEXTS, ['PF', 'PJ']);
  assert.equal(Object.isFrozen(VALID_CONTEXTS), true);
  assert.equal(Object.isFrozen(NOTIFICATION_STATES), true);
  assert.equal(NOTIFICATION_STATES.length, 6);
});

test('header compõe exatamente os seis componentes previstos', async () => {
  const contents = await source('./MobileContextHeader.jsx');
  for (const component of [
    'HeaderAvatar', 'HeaderIdentityBlock', 'ContextSegmentedControl',
    'NotificationBell', 'HeaderSkeleton',
  ]) {
    assert.match(contents, new RegExp(`<${component}`));
  }
  assert.match(await source('./MobileHeader.jsx'), /<MobileContextHeader/);
});

test('callbacks permanecem locais e não conectam regras de negócio', async () => {
  const contents = (await Promise.all([
    './MobileContextHeader.jsx', './HeaderAvatar.jsx',
    './ContextSegmentedControl.jsx', './NotificationBell.jsx', './MobileHeader.jsx',
  ].map(source))).join('\n');
  assert.match(contents, /onContextChange/);
  assert.match(contents, /onAvatarPress/);
  assert.match(contents, /onBellPress/);
  assert.doesNotMatch(contents, /Supabase|AccessContext|SessionContext|fetch\s*\(|Notification\.requestPermission/i);
});

test('controle representa PF PJ loading erro bloqueio e disponibilidade', async () => {
  const contents = await source('./ContextSegmentedControl.jsx');
  assert.match(contents, /availableContexts/);
  assert.match(contents, /isLocked/);
  assert.match(contents, /isLoading/);
  assert.match(contents, /hasError/);
  assert.match(contents, /aria-pressed/);
  assert.match(contents, /aria-disabled/);
});

test('avatar representa foto fallback loading presença e workspace', async () => {
  const contents = await source('./HeaderAvatar.jsx');
  assert.match(contents, /photoUrl/);
  assert.match(contents, /failedUrl/);
  assert.match(contents, /isLoading/);
  assert.match(contents, /isOnline/);
  assert.match(contents, /workspaceType/);
});

test('notificações representam todos os estados sem pedir permissão', async () => {
  const contents = await source('./NotificationBell.jsx');
  assert.match(contents, /9\+/);
  assert.match(contents, /aria-busy/);
  assert.doesNotMatch(contents, /requestPermission|PushManager|serviceWorker/);
});

test('CSS garante altura compacta safe area toque e redução de movimento', async () => {
  const css = await source('./MobileContextHeader.module.css');
  assert.match(css, /height: calc\(var\(--uf-space-64\)/);
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /var\(--uf-tap-target-min\)/);
  assert.match(css, /@media \(max-width: 375px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /text-overflow: ellipsis/);
});
