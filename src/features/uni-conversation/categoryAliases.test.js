import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeForAliasMatch, resolveCategoryAlias } from './categoryAliases.js';

// ============================================================================
// BLOCO UNI 1A: módulo puro de aliases determinísticos de categoria. Cobre
// normalização (acentos/caixa/pontuação/plural via substring segura) e
// resolução por palavra/frase inteira, sempre por nome canônico (nunca ID).
// ============================================================================

test('normalizeForAliasMatch remove acentos, maiúsculas e pontuação, preservando números', () => {
  assert.equal(normalizeForAliasMatch('Gastei R$ 50,00 no Mercado!'), 'gastei r 50 00 no mercado');
  assert.equal(normalizeForAliasMatch('Paguei a Farmácia.'), 'paguei a farmacia');
  assert.equal(normalizeForAliasMatch('Condomínio,  Água  e   Luz'), 'condominio agua e luz');
});

test('resolveCategoryAlias reconhece todos os aliases mínimos de despesa', () => {
  const cases = [
    ['mercado', 'Alimentação'], ['supermercado', 'Alimentação'], ['mercadinho', 'Alimentação'],
    ['padaria', 'Alimentação'], ['restaurante', 'Alimentação'], ['almoço', 'Alimentação'],
    ['jantar', 'Alimentação'], ['lanche', 'Alimentação'], ['comida', 'Alimentação'],
    ['uber', 'Transporte'], ['99', 'Transporte'], ['taxi', 'Transporte'], ['gasolina', 'Transporte'],
    ['combustível', 'Transporte'], ['posto', 'Transporte'], ['ônibus', 'Transporte'], ['metrô', 'Transporte'],
    ['aluguel', 'Moradia'], ['condomínio', 'Moradia'], ['prestação da casa', 'Moradia'],
    ['farmácia', 'Saúde'], ['remédio', 'Saúde'], ['médico', 'Saúde'], ['consulta', 'Saúde'], ['hospital', 'Saúde'],
    ['cinema', 'Lazer'], ['passeio', 'Lazer'], ['festa', 'Lazer'], ['viagem', 'Lazer'],
    ['curso', 'Educação'], ['escola', 'Educação'], ['faculdade', 'Educação'], ['mensalidade escolar', 'Educação'], ['livro', 'Educação'],
    ['netflix', 'Assinaturas'], ['spotify', 'Assinaturas'], ['streaming', 'Assinaturas'], ['assinatura', 'Assinaturas'],
    ['youtube premium', 'Assinaturas'], ['amazon prime', 'Assinaturas'],
    ['roupa', 'Compras'], ['calçado', 'Compras'], ['shopping', 'Compras'],
    ['energia', 'Contas da casa'], ['luz', 'Contas da casa'], ['água', 'Contas da casa'],
    ['internet', 'Contas da casa'], ['telefone', 'Contas da casa'], ['gás', 'Contas da casa'],
  ];
  for (const [term, canonicalName] of cases) {
    const result = resolveCategoryAlias({ text: `Gastei R$ 50 com ${term}`, transactionType: 'expense' });
    assert.ok(result, `esperava reconhecer "${term}"`);
    assert.equal(result.canonicalName, canonicalName, `"${term}" deveria apontar para ${canonicalName}`);
  }
});

test('resolveCategoryAlias reconhece todos os aliases mínimos de receita', () => {
  const cases = [
    ['salário', 'Salário'], ['pagamento do trabalho', 'Salário'], ['pagamento da empresa', 'Salário'],
    ['freela', 'Renda extra'], ['freelance', 'Renda extra'], ['serviço', 'Renda extra'], ['bico', 'Renda extra'],
    ['benefício', 'Benefício'], ['auxílio', 'Benefício'],
    ['rendimento', 'Investimentos'], ['dividendos', 'Investimentos'], ['juros', 'Investimentos'], ['investimento', 'Investimentos'],
    ['reembolso', 'Reembolso'], ['devolução', 'Reembolso'], ['estorno recebido', 'Reembolso'],
  ];
  for (const [term, canonicalName] of cases) {
    const result = resolveCategoryAlias({ text: `Recebi R$ 100 de ${term}`, transactionType: 'income' });
    assert.ok(result, `esperava reconhecer "${term}"`);
    assert.equal(result.canonicalName, canonicalName, `"${term}" deveria apontar para ${canonicalName}`);
  }
});

test('acentos não importam: "salario" (sem acento) reconhece o mesmo alias que "salário"', () => {
  const result = resolveCategoryAlias({ text: 'Recebi salario', transactionType: 'income' });
  assert.equal(result?.canonicalName, 'Salário');
});

test('maiúsculas não importam: "MERCADO" reconhece o mesmo alias que "mercado"', () => {
  const result = resolveCategoryAlias({ text: 'Gastei no MERCADO', transactionType: 'expense' });
  assert.equal(result?.canonicalName, 'Alimentação');
});

test('pontuação não impede o reconhecimento: "mercado." com ponto final', () => {
  const result = resolveCategoryAlias({ text: 'Gastei R$ 50 no mercado.', transactionType: 'expense' });
  assert.equal(result?.canonicalName, 'Alimentação');
});

test('respeita o tipo da transação: alias de receita nunca resolve em uma despesa', () => {
  assert.equal(resolveCategoryAlias({ text: 'Gastei com salário', transactionType: 'expense' }), null);
  assert.equal(resolveCategoryAlias({ text: 'Recebi de gasolina', transactionType: 'income' }), null);
});

test('"gas" nunca casa dentro de "gastei" -- só como palavra isolada', () => {
  const result = resolveCategoryAlias({ text: 'Gastei 50 reais', transactionType: 'expense' });
  assert.equal(result, null);
});

test('termo sem alias conhecido retorna null (nunca inventa uma categoria)', () => {
  const result = resolveCategoryAlias({ text: 'Paguei uma consultoria de marketing digital', transactionType: 'expense' });
  assert.equal(result, null);
});

test('sem texto (undefined/vazio) retorna null com segurança', () => {
  assert.equal(resolveCategoryAlias({ text: undefined, transactionType: 'expense' }), null);
  assert.equal(resolveCategoryAlias({ text: '', transactionType: 'expense' }), null);
});
