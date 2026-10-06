import assert from 'node:assert/strict';
import test from 'node:test';
import { describePlanChange, describeVoiceBalance, formatVoiceMinutes } from './planChangePresentation.js';
import { parseVoiceBalance } from '../../services/voiceQuotaService.js';

// Épico #116: textos da tela de plano para minutos e troca de plano.

test('minutos inteiros, no singular e no plural', () => {
  assert.equal(formatVoiceMinutes(3600), '60 minutos');
  assert.equal(formatVoiceMinutes(89), '1 minuto');
  assert.equal(formatVoiceMinutes(29), '0 minutos');
  assert.equal(formatVoiceMinutes(-5), '0 minutos');
});

test('saldo de voz mostra o que resta e quando renova; sem ciclo, nada', () => {
  const text = describeVoiceBalance(parseVoiceBalance({
    tier_id: 'uni_voz', seconds_granted: 3600, remaining_seconds: 2520, cycle_ends_at: '2026-11-06T03:00:00Z', has_active_subscription: true,
  }));
  assert.match(text, /^Restam 42 minutos de 60 neste mês\. Os minutos renovam em /);
  assert.equal(describeVoiceBalance(parseVoiceBalance({ seconds_granted: 0, remaining_seconds: 0 })), null);
  assert.equal(describeVoiceBalance(null), null);
  assert.equal(parseVoiceBalance({ remaining_seconds: -10, seconds_granted: 60 }).remainingSeconds, 0);
});

test('subir de plano: Pix com a diferença e minutos novos depois da confirmação', () => {
  const change = describePlanChange({ currentTierId: 'uni_voz', targetTierId: 'uni_voz_plus' });
  assert.equal(change.kind, 'upgrade');
  assert.equal(change.differenceLabel, 'R$ 40,00');
  assert.equal(change.confirmLabel, 'Pagar R$ 40,00 por Pix');
  assert.match(change.text, /Os 180 minutos do Uni Voz Plus entram assim que o pagamento for confirmado\./);
  assert.match(change.text, /o valor mensal passa a ser R\$ 69,90\./);
});

test('descer de plano: vale na próxima cobrança, sem cobrar nada agora', () => {
  const change = describePlanChange({ currentTierId: 'uni_voz_plus', targetTierId: 'essencial', renewsAt: '2026-11-06T12:00:00Z' });
  assert.equal(change.kind, 'downgrade');
  assert.equal(change.confirmLabel, 'Trocar para o Essencial');
  assert.match(change.text, /^A troca vale a partir da próxima cobrança, em /);
  assert.match(change.text, /continua com os minutos do Uni Voz Plus\./);
  assert.equal(describePlanChange({ currentTierId: 'uni_voz', targetTierId: 'essencial' }).text.includes('na próxima cobrança'), true);
});

test('mesmo plano não troca nada', () => {
  assert.equal(describePlanChange({ currentTierId: 'essencial', targetTierId: 'essencial' }).kind, 'same');
});
