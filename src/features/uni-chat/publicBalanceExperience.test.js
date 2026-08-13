import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isRetiredPublicBalanceRequest,
  PUBLIC_BALANCE_RETIREMENT_TEXT,
} from './publicBalanceExperience.js';
import { SUGGESTIONS_PESSOAL } from './mockData.js';

test('consultas públicas de saldo são interceptadas sem retornar valor', () => {
  for (const text of [
    'Qual meu saldo?',
    'Quanto tenho?',
    'Ver meu saldo',
    'Quanto dinheiro tenho?',
    'Bom dia, qual meu saldo?',
  ]) {
    assert.equal(isRetiredPublicBalanceRequest(text), true, text);
  }
  assert.match(PUBLIC_BALANCE_RETIREMENT_TEXT, /Entradas e Saídas/);
  assert.doesNotMatch(PUBLIC_BALANCE_RETIREMENT_TEXT, /R\$|\d[.,]\d/);
});

test('intents internos de saldo são descontinuados somente na porta pública', () => {
  assert.equal(isRetiredPublicBalanceRequest('consulta', 'check_balance'), true);
  assert.equal(isRetiredPublicBalanceRequest('ajuste', 'set_balance'), true);
  assert.equal(isRetiredPublicBalanceRequest('Tenho R$ 1.000', 'ambiguous_balance_or_income'), true);
});

test('Entradas e Saídas não são interceptadas', () => {
  for (const text of [
    'Recebi 1000 reais de um cliente',
    'Entrou 500 reais',
    'Gastei 200 reais no mercado',
    'Paguei 50 reais de gasolina',
  ]) {
    assert.equal(isRetiredPublicBalanceRequest(text), false, text);
  }
  assert.equal(
    isRetiredPublicBalanceRequest('Agenda uma reunião sobre saldo amanhã', 'agenda_create'),
    false,
  );
});

test('atalho público de Saldo foi substituído por Abrir agenda e navega para a rota existente', async () => {
  assert.equal(SUGGESTIONS_PESSOAL.some((item) => item.label === 'Ver meu saldo'), false);
  assert.equal(
    SUGGESTIONS_PESSOAL.some((item) => item.label === 'Abrir agenda' && item.intent === 'abrir_agenda'),
    true,
  );
  const page = await readFile(new URL('./UniChatPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /item\.intent === 'abrir_agenda'/);
  assert.match(page, /navigate\(SIMPLIFIED_ROUTES\.AGENDA\)/);
});
