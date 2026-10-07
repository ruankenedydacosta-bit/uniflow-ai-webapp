import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAMBIO_BRL,
  custoEmReais,
  MENSAGEM_TETO,
  registrarCusto,
  reservarChamada,
} from '../../../supabase/functions/_shared/uniLlmCota.js';

const BASE = { supabaseUrl: 'https://demo.supabase.co', serviceRoleKey: 'service', userId: 'u1' };

function respostaJson(corpo, ok = true) {
  return { ok, json: async () => corpo };
}

test('custo em reais segue os tokens medidos nos logs', () => {
  // Pergunta no chat: ~1.250 tokens de entrada e 50 de saída no gpt-5.4-mini.
  assert.equal(custoEmReais('gpt-5.4-mini', { entrada: 1250, saida: 50 }), 0.0064);
  // Lançamento no Luna: US$ 0,36 por mil frases na avaliação do épico.
  assert.equal(custoEmReais('gpt-5.6-luna', { entrada: 1200, saida: 100 }), 0.002);
  assert.equal(custoEmReais('gpt-5.4-mini', {}), 0);
  assert.equal(CAMBIO_BRL, 5.5);
});

test('modelo fora da tabela é cobrado pelo preço mais caro', () => {
  const conhecido = custoEmReais('gpt-5.4-mini', { entrada: 1000, saida: 100 });
  assert.ok(custoEmReais('modelo-novo', { entrada: 1000, saida: 100 }) > conhecido);
});

test('reserva traduz a resposta do banco e falha fechado', async () => {
  const comResposta = (corpo, ok) => reservarChamada({ ...BASE, fetchImpl: async () => respostaJson(corpo, ok) });
  assert.equal(await comResposta([{ allowed: true, reason: 'ok', calls: 3 }]), 'liberada');
  assert.equal(await comResposta([{ allowed: false, reason: 'daily_limit' }]), 'teto_diario');
  assert.equal(await comResposta([{ allowed: false, reason: 'monthly_ceiling' }]), 'teto_mensal');
  assert.equal(await comResposta({ erro: true }, false), 'indisponivel');
  assert.equal(await comResposta([{}]), 'indisponivel');
  assert.equal(await reservarChamada({ ...BASE, fetchImpl: async () => { throw new Error('rede'); } }), 'indisponivel');
  assert.equal(await reservarChamada({ ...BASE, userId: null, fetchImpl: async () => assert.fail('sem usuário não chama') }), 'indisponivel');
  assert.match(MENSAGEM_TETO.teto_mensal, /deste mês/);
});

test('registro manda o custo da chamada e nunca lança', async () => {
  let corpo;
  const ok = await registrarCusto({
    ...BASE,
    modelo: 'gpt-5.4-mini',
    uso: { entrada: 1250, saida: 50 },
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://demo.supabase.co/rest/v1/rpc/uni_llm_record_cost');
      corpo = JSON.parse(init.body);
      return { ok: true };
    },
  });
  assert.equal(ok, true);
  assert.deepEqual(corpo, { p_user_id: 'u1', p_cost_brl: 0.0064 });

  assert.equal(await registrarCusto({ ...BASE, modelo: 'gpt-5.4-mini', uso: {}, fetchImpl: async () => assert.fail('custo zero não grava') }), false);
  assert.equal(await registrarCusto({ ...BASE, modelo: 'gpt-5.4-mini', uso: { entrada: 10 }, fetchImpl: async () => { throw new Error('rede'); } }), false);
});
