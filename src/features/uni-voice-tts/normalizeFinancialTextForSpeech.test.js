// HOTFIX FINAL P3: normalizeFinancialTextForSpeech.js é puro (sem React,
// sem timers, sem DOM) -- coberto integralmente com node:test.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  amountToSpeech,
  integerToWords,
  normalizeFinancialTextForSpeech,
} from './normalizeFinancialTextForSpeech.js';

test('integerToWords cobre unidades, dezenas, dezenove, centenas e o caso especial "cem"', () => {
  assert.equal(integerToWords(0), 'zero');
  assert.equal(integerToWords(7), 'sete');
  assert.equal(integerToWords(19), 'dezenove');
  assert.equal(integerToWords(20), 'vinte');
  assert.equal(integerToWords(21), 'vinte e um');
  assert.equal(integerToWords(80), 'oitenta');
  assert.equal(integerToWords(97), 'noventa e sete');
  assert.equal(integerToWords(100), 'cem');
  assert.equal(integerToWords(101), 'cento e um');
  assert.equal(integerToWords(497), 'quatrocentos e noventa e sete');
});

test('integerToWords cobre milhar (com e sem resto, singular "mil")', () => {
  assert.equal(integerToWords(1000), 'mil');
  assert.equal(integerToWords(1001), 'mil e um');
  assert.equal(integerToWords(1100), 'mil e cem');
  assert.equal(integerToWords(1234), 'mil duzentos e trinta e quatro');
  assert.equal(integerToWords(2000), 'dois mil');
  assert.equal(integerToWords(2500), 'dois mil e quinhentos');
});

test('amountToSpeech cobre exatamente os exemplos do pedido', () => {
  assert.equal(amountToSpeech(497.80), 'quatrocentos e noventa e sete reais e oitenta centavos');
  assert.equal(amountToSpeech(80.00), 'oitenta reais');
  assert.equal(amountToSpeech(1.00), 'um real');
  assert.equal(amountToSpeech(0.50), 'cinquenta centavos');
  assert.equal(amountToSpeech(1234.56), 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos');
});

test('amountToSpeech: zero reais e zero centavos fala "zero reais"', () => {
  assert.equal(amountToSpeech(0), 'zero reais');
});

test('amountToSpeech: singular/plural de real e centavo', () => {
  assert.equal(amountToSpeech(1.01), 'um real e um centavo');
  assert.equal(amountToSpeech(2.02), 'dois reais e dois centavos');
});

test('normalizeFinancialTextForSpeech substitui "R$ X,XX" por extenso, preservando o restante da frase', () => {
  assert.equal(
    normalizeFinancialTextForSpeech('Em agosto, você gastou R$ 497,80 em despesas confirmadas.'),
    'Em agosto, você gastou quatrocentos e noventa e sete reais e oitenta centavos em despesas confirmadas.',
  );
});

test('normalizeFinancialTextForSpeech cobre separador de milhar ("R$ 1.234,56")', () => {
  assert.equal(
    normalizeFinancialTextForSpeech('O total foi R$ 1.234,56 este mês.'),
    'O total foi mil duzentos e trinta e quatro reais e cinquenta e seis centavos este mês.',
  );
});

test('normalizeFinancialTextForSpeech substitui MÚLTIPLOS valores na mesma frase', () => {
  assert.equal(
    normalizeFinancialTextForSpeech('Você gastou R$ 80,00 e recebeu R$ 1,00.'),
    'Você gastou oitenta reais e recebeu um real.',
  );
});

// HOTFIX FINAL (causa raiz da cobertura incompleta): o regex antigo exigia
// `,\d{2}` (centavos) obrigatoriamente -- qualquer valor inteiro sem
// centavos ("R$ 16.904") nunca batia e ia cru para o TTS. Centavos agora são
// opcionais no padrão.
test('normalizeFinancialTextForSpeech cobre valor SEM centavos, com separador de milhar ("R$ 16.904")', () => {
  assert.equal(
    normalizeFinancialTextForSpeech('Seu saldo está em R$ 16.904 e, neste mês, suas despesas somam R$ 552,80.'),
    'Seu saldo está em dezesseis mil novecentos e quatro reais e, neste mês, suas despesas somam quinhentos e cinquenta e dois reais e oitenta centavos.',
  );
});

test('normalizeFinancialTextForSpeech: "R$ 16.904,00" (centavos explicitamente zero) fala igual a "R$ 16.904"', () => {
  assert.equal(
    normalizeFinancialTextForSpeech('R$ 16.904,00'),
    'dezesseis mil novecentos e quatro reais',
  );
});

test('normalizeFinancialTextForSpeech: "R$ 1.000,50" (milhar redondo + centavos)', () => {
  assert.equal(
    normalizeFinancialTextForSpeech('O total foi R$ 1.000,50.'),
    'O total foi mil reais e cinquenta centavos.',
  );
});

test('normalizeFinancialTextForSpeech: valor sem separador de milhar e sem centavos ("R$ 552")', () => {
  assert.equal(normalizeFinancialTextForSpeech('R$ 552'), 'quinhentos e cinquenta e dois reais');
});

test('normalizeFinancialTextForSpeech trata sinal negativo com "menos" em vez de pronunciar o símbolo', () => {
  assert.equal(
    normalizeFinancialTextForSpeech('O resultado foi -R$ 50,00.'),
    'O resultado foi menos cinquenta reais.',
  );
});

test('normalizeFinancialTextForSpeech nunca altera texto sem valores monetários', () => {
  const text = 'Não encontrei gastos com "mercado" nos seus registros.';
  assert.equal(normalizeFinancialTextForSpeech(text), text);
});

test('normalizeFinancialTextForSpeech: entrada vazia/nula volta inalterada, nunca lança', () => {
  assert.equal(normalizeFinancialTextForSpeech(''), '');
  assert.equal(normalizeFinancialTextForSpeech(null), null);
  assert.equal(normalizeFinancialTextForSpeech(undefined), undefined);
});

test('normalização TTS converte data e horário estruturados em português natural', () => {
  assert.equal(
    normalizeFinancialTextForSpeech('Pronto. Coloquei reunião, dia 10/08 às 10:00 na sua agenda.'),
    'Pronto. Coloquei reunião, dia dez de agosto, às dez horas na sua agenda.',
  );
  assert.equal(
    normalizeFinancialTextForSpeech('Consulta em 14/08 às 15:30.'),
    'Consulta em dia catorze de agosto, às quinze horas e trinta minutos.',
  );
});

test('normalização TTS converte horários isolados válidos sem alterar o texto visual original', () => {
  const original = 'Primeiro às 10:30; depois às 22:00.';
  assert.equal(
    normalizeFinancialTextForSpeech(original),
    'Primeiro às dez horas e trinta minutos; depois às vinte e duas horas.',
  );
  assert.equal(original, 'Primeiro às 10:30; depois às 22:00.');
});

test('normalização TTS preserva URLs, dinheiro e números não relacionados', () => {
  assert.equal(
    normalizeFinancialTextForSpeech('Abra https://exemplo.com/reuniao/10:30?id=14/08, código 1030, total R$ 10,30.'),
    'Abra https://exemplo.com/reuniao/10:30?id=14/08, código 1030, total dez reais e trinta centavos.',
  );
});

test('normalização TTS não converte datas ou horas inválidas parcialmente', () => {
  const invalid = 'Datas 32/08 às 10:00 e 10/13 às 25:00; horas 24:30 e 10:60.';
  assert.equal(normalizeFinancialTextForSpeech(invalid), invalid);
});
