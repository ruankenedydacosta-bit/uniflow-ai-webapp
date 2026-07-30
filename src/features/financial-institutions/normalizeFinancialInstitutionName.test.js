import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinancialInstitutionName } from './normalizeFinancialInstitutionName.js';

test('caso real: "No Bank" (transcrição de "Nubank") normaliza para Nubank', () => {
  const result = normalizeFinancialInstitutionName('No Bank');
  assert.equal(result.canonicalName, 'Nubank');
  assert.equal(result.original, 'No Bank');
  assert.equal(result.institutionType, 'bank');
  assert.ok(result.confidence > 0);
});

test('"Nu Bank" normaliza para Nubank', () => {
  assert.equal(normalizeFinancialInstitutionName('Nu Bank').canonicalName, 'Nubank');
});

test('"Nuban" normaliza para Nubank', () => {
  assert.equal(normalizeFinancialInstitutionName('Nuban').canonicalName, 'Nubank');
});

test('"Nubenk" e "Nubanki" normalizam para Nubank', () => {
  assert.equal(normalizeFinancialInstitutionName('Nubenk').canonicalName, 'Nubank');
  assert.equal(normalizeFinancialInstitutionName('Nubanki').canonicalName, 'Nubank');
});

test('"Nú Bank" (com acento) normaliza para Nubank', () => {
  assert.equal(normalizeFinancialInstitutionName('Nú Bank').canonicalName, 'Nubank');
});

test('"mercado pagou" normaliza para Mercado Pago', () => {
  assert.equal(normalizeFinancialInstitutionName('mercado pagou').canonicalName, 'Mercado Pago');
});

test('"pique pay" normaliza para PicPay', () => {
  assert.equal(normalizeFinancialInstitutionName('pique pay').canonicalName, 'PicPay');
});

test('"c seis" normaliza para C6 Bank', () => {
  assert.equal(normalizeFinancialInstitutionName('c seis').canonicalName, 'C6 Bank');
});

test('"bê tê gê" (fonético) normaliza para BTG Pactual', () => {
  assert.equal(normalizeFinancialInstitutionName('bê tê gê').canonicalName, 'BTG Pactual');
});

test('"bê eme gê" (fonético) normaliza para Banco BMG', () => {
  assert.equal(normalizeFinancialInstitutionName('bê eme gê').canonicalName, 'Banco BMG');
});

test('"sicob" normaliza para Sicoob', () => {
  assert.equal(normalizeFinancialInstitutionName('sicob').canonicalName, 'Sicoob');
});

test('"itau" (sem acento) normaliza para Itaú com matchType exact', () => {
  const result = normalizeFinancialInstitutionName('itau');
  assert.equal(result.canonicalName, 'Itaú');
  assert.equal(result.matchType, 'exact');
  assert.equal(result.confidence, 1);
});

test('"caixa" isolado NÃO normaliza sem contexto de conta (ambíguo: caixa física/da empresa)', () => {
  const result = normalizeFinancialInstitutionName('caixa');
  assert.equal(result.canonicalName, null);
  assert.equal(result.matchType, null);
});

test('"caixa" COM contexto de conta normaliza para Caixa Econômica Federal', () => {
  const result = normalizeFinancialInstitutionName('caixa', { hasAccountContext: true });
  assert.equal(result.canonicalName, 'Caixa Econômica Federal');
});

test('"inter" isolado NÃO normaliza sem contexto financeiro adequado', () => {
  assert.equal(normalizeFinancialInstitutionName('inter').canonicalName, null);
});

test('"inter" COM contexto normaliza para Banco Inter', () => {
  assert.equal(normalizeFinancialInstitutionName('inter', { hasAccountContext: true }).canonicalName, 'Banco Inter');
});

test('"will" isolado NÃO vira Will Bank sem contexto (pode ser nome próprio)', () => {
  assert.equal(normalizeFinancialInstitutionName('will').canonicalName, null);
});

test('"will" COM contexto de conta normaliza para Will Bank', () => {
  assert.equal(normalizeFinancialInstitutionName('will', { hasAccountContext: true }).canonicalName, 'Will Bank');
});

test('"next" isolado NÃO vira Banco Next sem contexto (palavra comum)', () => {
  assert.equal(normalizeFinancialInstitutionName('next').canonicalName, null);
});

test('"next" COM contexto de conta normaliza para Next', () => {
  assert.equal(normalizeFinancialInstitutionName('next', { hasAccountContext: true }).canonicalName, 'Next');
});

test('"bb" isolado não normaliza sem contexto; com contexto vira Banco do Brasil', () => {
  assert.equal(normalizeFinancialInstitutionName('bb').canonicalName, null);
  assert.equal(normalizeFinancialInstitutionName('bb', { hasAccountContext: true }).canonicalName, 'Banco do Brasil');
});

test('busca é case-insensitive e ignora acentos', () => {
  assert.equal(normalizeFinancialInstitutionName('NUBANK').canonicalName, 'Nubank');
  assert.equal(normalizeFinancialInstitutionName('BRADESCO').canonicalName, 'Bradesco');
  assert.equal(normalizeFinancialInstitutionName('bradesco').canonicalName, 'Bradesco');
  assert.equal(normalizeFinancialInstitutionName('Itaú').canonicalName, 'Itaú');
  assert.equal(normalizeFinancialInstitutionName('ITAU').canonicalName, 'Itaú');
});

test('pontuação não interfere na normalização', () => {
  assert.equal(normalizeFinancialInstitutionName('nu-bank!').canonicalName, 'Nubank');
  assert.equal(normalizeFinancialInstitutionName('pic.pay').canonicalName, 'PicPay');
  assert.equal(normalizeFinancialInstitutionName('c6, bank').canonicalName, 'C6 Bank');
});

test('espaços extras/duplicados são normalizados antes da comparação', () => {
  assert.equal(normalizeFinancialInstitutionName('  nu   bank  ').canonicalName, 'Nubank');
});

test('nenhuma correspondência real nunca inventa uma instituição (texto genérico permanece null)', () => {
  const result = normalizeFinancialInstitutionName('comprei um lanche na padaria');
  assert.equal(result.canonicalName, null);
  assert.equal(result.matchType, null);
  assert.equal(result.confidence, 0);
});

test('texto vazio/inválido nunca lança e retorna resultado nulo', () => {
  assert.equal(normalizeFinancialInstitutionName('').canonicalName, null);
  assert.equal(normalizeFinancialInstitutionName(null).canonicalName, null);
  assert.equal(normalizeFinancialInstitutionName(undefined).canonicalName, null);
  assert.equal(normalizeFinancialInstitutionName(42).canonicalName, null);
});

test('fuzzy matching nunca se aplica a termos com 3 caracteres ou menos (ex.: "bb", "xp", "c6")', () => {
  // "bb"/"xp" têm 2 caracteres -- mesmo com contexto, só correspondência
  // explícita de alias/canônico é aceita, nunca uma distância fuzzy.
  assert.equal(normalizeFinancialInstitutionName('bx', { hasAccountContext: true }).matchType, null);
});

test('fuzzy conservador: um typo plausível de uma instituição não-ambígua ainda resolve', () => {
  // "santader" (falta um "n") -- distância 1 de "santander" (9 letras, limite 2)
  const result = normalizeFinancialInstitutionName('santader');
  assert.equal(result.canonicalName, 'Santander');
  assert.equal(result.matchType, 'fuzzy');
  assert.ok(result.confidence > 0 && result.confidence < 1);
});

test('resultado preserva o texto original sem alterá-lo', () => {
  const result = normalizeFinancialInstitutionName('No Bank');
  assert.equal(result.original, 'No Bank');
  assert.notEqual(result.original, result.canonicalName);
});

test('contrato de retorno contém todos os campos essenciais', () => {
  const result = normalizeFinancialInstitutionName('Nubank');
  assert.ok('original' in result);
  assert.ok('normalizedInput' in result);
  assert.ok('canonicalName' in result);
  assert.ok('institutionType' in result);
  assert.ok('confidence' in result);
  assert.ok('matchType' in result);
  assert.ok('matchedAlias' in result);
});
