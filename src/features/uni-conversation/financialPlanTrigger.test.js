import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countMoneyMentions,
  isUnsupportedIntentEligibleForPlan,
  looksLikeFreshFinancialStatement,
  looksLikeUnclassifiedFinancialStatement,
} from './financialPlanTrigger.js';

test('countMoneyMentions conta menções em R$ e "reais"', () => {
  assert.equal(countMoneyMentions('Gastei R$ 80 no mercado e R$ 50 de gasolina'), 2);
  assert.equal(countMoneyMentions('Recebi 100 reais e gastei 30 reais'), 2);
  assert.equal(countMoneyMentions('Gastei 80 no mercado'), 0);
  assert.equal(countMoneyMentions(''), 0);
  assert.equal(countMoneyMentions(null), 0);
});

test('isUnsupportedIntentEligibleForPlan só é true para register_transfer', () => {
  assert.equal(isUnsupportedIntentEligibleForPlan('register_transfer'), true);
  assert.equal(isUnsupportedIntentEligibleForPlan('create_goal'), false);
  assert.equal(isUnsupportedIntentEligibleForPlan('register_expense'), false);
  assert.equal(isUnsupportedIntentEligibleForPlan(undefined), false);
});

test('looksLikeFreshFinancialStatement detecta um enunciado financeiro novo e autossuficiente (verbo + valor)', () => {
  assert.equal(
    looksLikeFreshFinancialStatement('Gastei R$ 50 no mercado e a gasolina eu paguei pelo Banco do Brasil.'),
    true,
  );
  assert.equal(looksLikeFreshFinancialStatement('Recebi 200 reais de salário'), true);
});

// BUG REAL (BUG 2): "entrou/caiu/entraram/cairam" não estavam em
// FINANCIAL_VERB_RE -- "Entrou mil reais." não era um fresh statement e,
// com pendência ativa, virava resposta de campo (proposta de conta
// "Entrou mil reais"). Com verbo + valor (por extenso incluso), estas
// frases SÃO enunciados novos e autossuficientes.
test('BUG REAL: "Entrou/Caiu/Entraram mil reais." são fresh statements -- nunca resposta de pendência', () => {
  assert.equal(looksLikeFreshFinancialStatement('Entrou mil reais.'), true);
  assert.equal(looksLikeFreshFinancialStatement('Entrou R$ 500.'), true);
  assert.equal(looksLikeFreshFinancialStatement('Caiu mil reais.'), true);
  assert.equal(looksLikeFreshFinancialStatement('Entraram mil reais.'), true);
  assert.equal(looksLikeFreshFinancialStatement('Caiu quinhentos.'), true);
  assert.equal(looksLikeFreshFinancialStatement('Caiu um Pix de mil reais.'), true);
  assert.equal(looksLikeFreshFinancialStatement('Recebi um Pix de mil.'), true);
});

test('BUG REAL: "Entrou meu salário." (verbo sem valor) NÃO é fresh statement -- mas a guarda de conta o protege', () => {
  assert.equal(looksLikeFreshFinancialStatement('Entrou meu salário.'), false);
});

test('looksLikeFreshFinancialStatement NÃO dispara para respostas curtas de correção (sem verbo+valor ao mesmo tempo)', () => {
  assert.equal(looksLikeFreshFinancialStatement('foi no Nubank'), false);
  assert.equal(looksLikeFreshFinancialStatement('Foi ontem'), false);
  assert.equal(looksLikeFreshFinancialStatement('200 reais'), false);
  assert.equal(looksLikeFreshFinancialStatement('confirmar'), false);
  assert.equal(looksLikeFreshFinancialStatement(''), false);
  assert.equal(looksLikeFreshFinancialStatement(null), false);
});

// ============================================================================
// BUG REAL EM PRODUÇÃO: "Coloquei duzentos reais de gasolina." não batia em
// nenhum intent de classifyIntent (nenhum verbo reconhecido) -- o parser de
// uma única operação devolvia handled:false com intent 'question', e como
// isso não era elegível para financial_plan (só register_transfer era) nem
// create_goal nem intenção de futuro, a frase caía direto em
// handleUnresolvedMessage (chat geral), cujo prompt de suporte
// corretamente diz "você só pode orientar, nunca dizer que fez" -- daí a
// resposta indevida "não consigo registrar daqui". looksLikeUnclassifiedFinancialStatement
// é a barreira determinística de última instância: some sinal mínimo de
// lançamento (verbo OU substantivo despesa/gasto/receita/entrada/pagamento)
// + um valor monetário real nunca pode ir para o chat geral.
// ============================================================================

test('looksLikeUnclassifiedFinancialStatement detecta o caso real "Coloquei duzentos reais de gasolina."', () => {
  assert.equal(looksLikeUnclassifiedFinancialStatement('Coloquei duzentos reais de gasolina.'), true);
});

test('looksLikeUnclassifiedFinancialStatement detecta valor + substantivo de lançamento mesmo sem verbo catalogado', () => {
  assert.equal(looksLikeUnclassifiedFinancialStatement('Uma despesa de R$ 70 no cartão'), true);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Uma receita de R$ 500 hoje'), true);
});

// BUG REAL EM PRODUCAO (voz): pedido com plural, "saída" ou verbo de
// pedido ia para o chat geral, que respondia "não consigo criar".
test('looksLikeUnclassifiedFinancialStatement detecta pedido falado com plural, "saída" ou verbo de pedido', () => {
  assert.equal(looksLikeUnclassifiedFinancialStatement('Põe aí 250 de despesas com gasolina'), true);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Uma saída de 80 reais na farmácia'), true);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Será que dá pra incluir 40 reais de padaria?'), true);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Quero adicionar uma conta nova'), false);
});

// BUG REAL EM PRODUCAO (voz, 10/10/2026): a Uni da conversa por voz disse
// que não conseguia registrar movimentações.
test('looksLikeUnclassifiedFinancialStatement detecta pedido com "lançamento" ou "movimentação"', () => {
  assert.equal(looksLikeUnclassifiedFinancialStatement('Fazer um lançamento de teste: descrição “teste”, categoria “educação”, valor 350 reais, na data de cinco de outubro deste ano.'), true);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Faz um lançamento de 350 reais em educação'), true);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Cria uma movimentação de trezentos e cinquenta reais'), true);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Insere 80 reais de padaria'), true);
});

test('looksLikeUnclassifiedFinancialStatement NÃO trata pergunta sobre lançamentos nem criação de conta como lançamento', () => {
  assert.equal(looksLikeUnclassifiedFinancialStatement('Quais lançamentos acima de 200 reais eu fiz esse mês?'), false);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Me mostra as transações de mais de 100 reais'), false);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Criar uma conta Nubank com 500 reais de saldo'), false);
});

test('looksLikeUnclassifiedFinancialStatement NÃO dispara sem nenhum valor monetário real', () => {
  assert.equal(looksLikeUnclassifiedFinancialStatement('Oi, tudo bem?'), false);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Coloquei uma música nova'), false);
  assert.equal(looksLikeUnclassifiedFinancialStatement(''), false);
  assert.equal(looksLikeUnclassifiedFinancialStatement(null), false);
});

test('looksLikeUnclassifiedFinancialStatement NÃO dispara para consulta genérica com valor (ex.: comparação), sem verbo/substantivo de lançamento', () => {
  assert.equal(looksLikeUnclassifiedFinancialStatement('Esse produto custa 200 reais a mais que o outro na loja'), false);
});

