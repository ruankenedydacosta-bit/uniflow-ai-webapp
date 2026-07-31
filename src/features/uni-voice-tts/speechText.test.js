import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSpeechText } from './speechText.js';

// ============================================================================
// BLOCO VOZ 1 -- buildSpeechText: versão curta e natural para a voz sem
// alterar o texto completo exibido na tela. Nunca corta palavra ao meio,
// nunca devolve vazio com texto de entrada, e maxLength inválido é ignorado
// (texto completo volta sem corte).
// ============================================================================

test('buildSpeechText preserva texto curto, com trim de extremidades', () => {
  assert.equal(buildSpeechText('Olá, tudo bem?', 600), 'Olá, tudo bem?');
  assert.equal(buildSpeechText('  Olá  ', 600), 'Olá');
  assert.equal(buildSpeechText('exatamente-600-'.repeat(55).slice(0, 600), 600).length, 600);
});

test('buildSpeechText encerra em frase quando possível (último fim de frase dentro do limite)', () => {
  const input = 'Primeira frase curta. Segunda frase muito mais longa com vários detalhes extras aqui.';
  const out = buildSpeechText(input, 30);
  assert.ok(out.length <= 30, `out.length=${out.length}`);
  assert.equal(out, 'Primeira frase curta.');
});

test('buildSpeechText corta na última palavra completa com reticências quando não há frase razoável', () => {
  const input = 'segunda frase sem ponto final que continua por muito tempo além do limite definido aqui';
  const out = buildSpeechText(input, 30);
  assert.ok(out.length <= 30, `out.length=${out.length}`);
  assert.match(out, /…$/);
  assert.equal(input.startsWith(out.slice(0, -1)), true, 'o corpo antes das reticências é prefixo do texto original');
  assert.equal(input[out.slice(0, -1).length], ' ', 'o corte acontece exatamente num limite de palavra');
});

test('buildSpeechText nunca corta palavra ao meio', () => {
  const input = 'Hoje gastei cinquenta reais no mercado da esquina e também na farmácia do bairro.';
  for (const max of [15, 25, 40, 55, 90]) {
    const out = buildSpeechText(input, max);
    const core = out.endsWith('…') ? out.slice(0, -1) : out;
    assert.ok(input.startsWith(core), `core não é prefixo para max=${max}`);
    if (out.endsWith('…')) {
      assert.equal(input[core.length], ' ', `corte no meio da palavra para max=${max}`);
    } else {
      assert.match(core, /[.!?]$/, `deveria encerrar em frase para max=${max}`);
    }
  }
});

test('buildSpeechText devolve a janela inteira quando ela já termina num fim de frase', () => {
  const input = 'Primeira frase. Segunda frase que continua além do limite fixado aqui.';
  const out = buildSpeechText(input, 15);
  assert.equal(out, 'Primeira frase.');
});

test('buildSpeechText nunca excede maxLength com texto normal (espaçado)', () => {
  const input = 'frase '.repeat(120).trim();
  assert.equal(input.length, 719);
  for (const max of [10, 100, 300, 599, 600]) {
    const out = buildSpeechText(input, max);
    assert.ok(out.length <= max, `max=${max} out.length=${out.length}`);
  }
});

test('buildSpeechText não corta uma única palavra longa (sem espaço para cortar) -- volta inteira', () => {
  const word = 'abcdefgh'.repeat(100);
  assert.equal(word.length, 800);
  assert.equal(buildSpeechText(word, 600), word);
});

test('buildSpeechText ignora maxLength inválido e devolve o texto completo sem corte', () => {
  const long = 'a '.repeat(1000);
  for (const invalid of [undefined, null, NaN, 0, -5, '600', Infinity]) {
    assert.equal(buildSpeechText(long, invalid), long.trim(), `maxLength=${String(invalid)}`);
  }
});

test('buildSpeechText devolve texto vazio/nulo como está', () => {
  assert.equal(buildSpeechText(null, 600), null);
  assert.equal(buildSpeechText(undefined, 600), undefined);
  assert.equal(buildSpeechText('', 600), '');
  assert.equal(buildSpeechText('   ', 600), '');
});

test('buildSpeechText nunca devolve string vazia enquanto houver texto de entrada', () => {
  for (const max of [1, 5, 40, 600]) {
    assert.ok(buildSpeechText('palavra', max).length > 0, `max=${max}`);
  }
});
