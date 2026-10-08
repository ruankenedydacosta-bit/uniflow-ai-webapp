import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseVoiceBalance } from '../../services/voiceQuotaService.js';
import {
  describeVoiceMinutesChip,
  describeVoiceMinutesNotice,
  describeVoiceMinutesOut,
  readDismissedVoiceMinutesNotice,
  resolveVoiceMinutes,
  writeDismissedVoiceMinutesNotice,
} from './voiceMinutesPresentation.js';

// Tela 19 do redesign: saldo de minutos na tela de voz e na Home.

function balance(remainingSeconds, extra = {}) {
  return parseVoiceBalance({
    tier_id: 'uni_voz',
    seconds_granted: 3600,
    remaining_seconds: remainingSeconds,
    cycle_ends_at: '2026-11-06T03:00:00Z',
    has_active_subscription: true,
    ...extra,
  });
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test('sem ciclo de minutos, nada aparece', () => {
  assert.equal(resolveVoiceMinutes(null), null);
  assert.equal(resolveVoiceMinutes(parseVoiceBalance({ seconds_granted: 0, remaining_seconds: 0 })), null);
  assert.equal(describeVoiceMinutesChip(null), null);
  assert.equal(describeVoiceMinutesNotice(null), null);
});

test('chip da tela de voz: neutro com saldo folgado, violeta com 5 minutos ou menos', () => {
  assert.deepEqual(describeVoiceMinutesChip(resolveVoiceMinutes(balance(22 * 60 + 40))), {
    label: '22 min restantes',
    title: 'Restam 22 minutos de voz este mês',
    isLow: false,
  });
  assert.equal(describeVoiceMinutesChip(resolveVoiceMinutes(balance(5 * 60))).isLow, true);
  assert.equal(describeVoiceMinutesChip(resolveVoiceMinutes(balance(60))).title, 'Resta 1 minuto de voz este mês');
  assert.equal(describeVoiceMinutesChip(resolveVoiceMinutes(balance(30))).label, 'Menos de 1 min');
  assert.equal(describeVoiceMinutesChip(resolveVoiceMinutes(balance(0))), null);
});

test('sem assinatura ativa, o ciclo que sobrou não aparece', () => {
  assert.equal(resolveVoiceMinutes(balance(12 * 60, { has_active_subscription: false })), null);
});

test('durante a conversa, o tempo dela sai do saldo lido antes de começar', () => {
  assert.equal(resolveVoiceMinutes(balance(8 * 60), { spentSeconds: 6 * 60 + 10 }).minutes, 1);
  assert.equal(resolveVoiceMinutes(balance(8 * 60), { spentSeconds: 9 * 60 }).isOut, true);
  assert.equal(resolveVoiceMinutes(balance(8 * 60), { spentSeconds: -30 }).minutes, 8);
});

test('saldo zerado só com zero segundo: meio minuto ainda abre uma conversa', () => {
  assert.equal(resolveVoiceMinutes(balance(30)).isOut, false);
  assert.equal(resolveVoiceMinutes(balance(0)).isOut, true);
});

test('tela sem minutos diz quando renova e manda escrever', () => {
  const out = describeVoiceMinutesOut(resolveVoiceMinutes(balance(0)));
  assert.equal(out.status, 'Sem minutos de voz');
  assert.equal(out.title, 'Seus minutos de voz deste mês acabaram.');
  assert.equal(out.body, 'Eles renovam em 6 de novembro. Até lá, você pode escrever para a Uni.');
  assert.match(
    describeVoiceMinutesOut(resolveVoiceMinutes(balance(0, { cycle_ends_at: null }))).body,
    /^Eles renovam no início do próximo ciclo do plano\./,
  );
});

test('aviso da Home: só com 5 minutos ou menos, e outro texto quando acaba', () => {
  assert.equal(describeVoiceMinutesNotice(resolveVoiceMinutes(balance(6 * 60))), null);

  const low = describeVoiceMinutesNotice(resolveVoiceMinutes(balance(5 * 60 + 20)));
  assert.equal(low.title, 'Restam 5 minutos de voz este mês');
  assert.equal(low.body, 'Eles renovam em 6 de novembro. Quando acabarem, você ainda pode escrever para a Uni.');

  const out = describeVoiceMinutesNotice(resolveVoiceMinutes(balance(0)));
  assert.equal(out.title, 'Seus minutos de voz acabaram');
  assert.equal(out.body, 'Eles renovam em 6 de novembro. Até lá, você pode escrever para a Uni.');
  assert.notEqual(low.key, out.key);

  const nextCycle = describeVoiceMinutesNotice(resolveVoiceMinutes(balance(0, { cycle_ends_at: '2026-12-06T03:00:00Z' })));
  assert.notEqual(nextCycle.key, out.key);
});

test('"Entendi" fica salvo por pessoa e sobrevive a storage quebrado', () => {
  const storage = memoryStorage();
  writeDismissedVoiceMinutesNotice('user-a', 'ciclo:baixo', storage);
  assert.equal(readDismissedVoiceMinutesNotice('user-a', storage), 'ciclo:baixo');
  assert.equal(readDismissedVoiceMinutesNotice('user-b', storage), null);
  assert.equal(readDismissedVoiceMinutesNotice(null, storage), null);

  const broken = {
    getItem() { throw new Error('bloqueado'); },
    setItem() { throw new Error('bloqueado'); },
  };
  assert.equal(readDismissedVoiceMinutesNotice('user-a', broken), null);
  assert.doesNotThrow(() => writeDismissedVoiceMinutesNotice('user-a', 'ciclo:baixo', broken));
});

test('tela de voz e Home usam o saldo: sem minutos, a conversa não conecta', () => {
  const home = readFileSync(new URL('./SimplifiedHomeView.jsx', import.meta.url), 'utf8');
  assert.match(home, /if \(isVoiceMinutesOut\) refreshVoiceMinutes\(\);\s*else beginRealtimeConversation\(\);/);
  assert.match(home, /const isVoiceMinutesOut = voiceMinutes\?\.isOut === true && !isRealtimeLive;/);
  assert.match(home, /voiceMinutes=\{voiceMinutes\}/);
  assert.match(home, /<SimplifiedVoiceMinutesNotice/);

  const voiceMode = readFileSync(new URL('./SimplifiedVoiceMode.jsx', import.meta.url), 'utf8');
  assert.match(voiceMode, /describeVoiceMinutesChip\(voiceMinutes\)/);
  assert.match(voiceMode, /aria-label="Ver plano"/);
});
