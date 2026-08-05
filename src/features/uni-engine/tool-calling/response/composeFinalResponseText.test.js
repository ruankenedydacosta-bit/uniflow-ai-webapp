// Uni Engine — Fase 22/23: testes da composição consultiva da resposta final.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeFinalResponseText } from './composeFinalResponseText.js';

test('ToolResult ausente: preserva exatamente o llmText (comportamento legado)', () => {
  assert.equal(
    composeFinalResponseText({ llmText: 'Olá! Como posso ajudar?', toolResponseText: null }),
    'Olá! Como posso ajudar?',
  );
  assert.equal(
    composeFinalResponseText({ llmText: 'Olá!', toolResponseText: undefined }),
    'Olá!',
  );
});

test('fallback completo: sem llmText e sem toolResponseText retorna null', () => {
  assert.equal(composeFinalResponseText({ llmText: null, toolResponseText: null }), null);
  assert.equal(composeFinalResponseText({}), null);
});

test('ToolResult presente sem llmText: retorna a narrativa sozinha', () => {
  assert.equal(
    composeFinalResponseText({ llmText: null, toolResponseText: 'Seu saldo é R$ 100,00.' }),
    'Seu saldo é R$ 100,00.',
  );
  assert.equal(
    composeFinalResponseText({ llmText: '   ', toolResponseText: 'Seu saldo é R$ 100,00.' }),
    'Seu saldo é R$ 100,00.',
  );
});

test('estilo simple: extremamente objetivo — só a conclusão, sem o texto conversacional do LLM (ToolResult simples)', () => {
  const text = composeFinalResponseText({
    llmText: 'Deixa eu conferir isso pra você.',
    toolResponseText: 'Seu saldo é R$ 100,00.',
    conversationStyle: 'simple',
  });
  assert.equal(text, 'Seu saldo é R$ 100,00.');
  assert.doesNotMatch(text, /Deixa eu conferir/);
});

test('estilo simple: com ToolResult complexo (múltiplas frases), fica só com a primeira (a conclusão)', () => {
  const text = composeFinalResponseText({
    llmText: 'Vou te mostrar seu resumo.',
    toolResponseText: 'No período de 2026-08, o resultado foi de R$ 2.000,00. Seu saldo atual é de R$ 5.000,00. Você tem 2 metas em andamento.',
    conversationStyle: 'simple',
  });
  assert.equal(text, 'No período de 2026-08, o resultado foi de R$ 2.000,00.');
  assert.doesNotMatch(text, /metas em andamento/);
});

test('estilo normal: equilíbrio — conclusão + explicação (LLM) + detalhes, num parágrafo corrido (sem \\n\\n)', () => {
  const text = composeFinalResponseText({
    llmText: 'Deixa eu conferir isso pra você.',
    toolResponseText: 'Seu saldo é R$ 100,00. Você não tem despesas recorrentes ainda.',
    conversationStyle: 'normal',
  });
  assert.doesNotMatch(text, /\n\n/);
  assert.match(text, /^Seu saldo é R\$ 100,00\./);
  assert.match(text, /Deixa eu conferir/);
  assert.match(text, /despesas recorrentes/);
});

test('estilo detailed: resposta completa, partes separadas por parágrafo (\\n\\n)', () => {
  const text = composeFinalResponseText({
    llmText: 'Deixa eu conferir isso pra você.',
    toolResponseText: 'Seu saldo é R$ 100,00. Você não tem despesas recorrentes ainda.',
    conversationStyle: 'detailed',
  });
  assert.match(text, /\n\n/);
  const parts = text.split('\n\n');
  assert.equal(parts[0], 'Seu saldo é R$ 100,00.');
});

test('priorização correta: a conclusão (primeira frase da narrativa) sempre vem primeiro, antes da explicação do LLM', () => {
  const text = composeFinalResponseText({
    llmText: 'Aqui está o que encontrei.',
    toolResponseText: 'O resultado do mês foi positivo. As despesas caíram 10% em relação ao mês anterior.',
    conversationStyle: 'detailed',
  });
  const parts = text.split('\n\n');
  assert.equal(parts[0], 'O resultado do mês foi positivo.');
  assert.equal(parts.at(-1), 'As despesas caíram 10% em relação ao mês anterior.');
});

test('ausência de repetição: frase do LLM já coberta pela narrativa é descartada (dedup por frase, não só string inteira)', () => {
  const text = composeFinalResponseText({
    llmText: 'Seu saldo é R$ 100,00, tudo certo por aqui! Precisa de mais alguma coisa?',
    toolResponseText: 'Seu saldo é R$ 100,00.',
    conversationStyle: 'detailed',
  });
  assert.equal((text.match(/R\$ 100,00/g) ?? []).length, 1);
  assert.match(text, /Precisa de mais alguma coisa\?/);
});

test('ausência de repetição: nenhuma frase do LLM sobra quando a narrativa já cobre tudo o que ele disse', () => {
  const text = composeFinalResponseText({
    llmText: 'Seu saldo é R$ 100,00.',
    toolResponseText: 'Seu saldo é R$ 100,00. Você tem 3 contas cadastradas.',
    conversationStyle: 'detailed',
  });
  assert.doesNotMatch(text, /\n\n Seu saldo é R\$ 100,00\.\n\n/);
  assert.equal((text.match(/Seu saldo é R\$ 100,00/g) ?? []).length, 1);
});

test('prevenção de duplicação (string inteira): se o llmText já contém a narrativa, não repete', () => {
  const text = composeFinalResponseText({
    llmText: 'Seu saldo é R$ 100,00, tudo certo por aqui!',
    toolResponseText: 'Seu saldo é R$ 100,00.',
    conversationStyle: 'normal',
  });
  assert.equal(text, 'Seu saldo é R$ 100,00, tudo certo por aqui!');
  assert.equal((text.match(/R\$ 100,00/g) ?? []).length, 1);
});

test('prevenção de duplicação (string inteira): se a narrativa já contém o llmText, fica só com a narrativa', () => {
  const text = composeFinalResponseText({
    llmText: 'Seu saldo',
    toolResponseText: 'Seu saldo atual é de R$ 100,00.',
    conversationStyle: 'normal',
  });
  assert.equal(text, 'Seu saldo atual é de R$ 100,00.');
});

test('múltiplas informações (ToolResult complexo): todas as frases de detalhe são preservadas em detailed, sem repetição', () => {
  const text = composeFinalResponseText({
    llmText: 'Vamos ver como você está indo.',
    toolResponseText: 'Você tem 3 metas: Viagem: 40% concluída; Reserva: 80% concluída; Carro: 10% concluída.',
    conversationStyle: 'detailed',
  });
  assert.match(text, /Viagem/);
  assert.match(text, /Reserva/);
  assert.match(text, /Carro/);
  assert.match(text, /Vamos ver como você está indo\./);
});

test('continuidade de conversa: chamadas independentes não retêm estado entre turnos (função pura)', () => {
  const first = composeFinalResponseText({ llmText: 'Turno 1', toolResponseText: 'Dado 1.', conversationStyle: 'detailed' });
  const second = composeFinalResponseText({ llmText: 'Turno 2', toolResponseText: null, conversationStyle: 'detailed' });
  assert.match(first, /Turno 1/);
  assert.match(first, /Dado 1/);
  assert.equal(second, 'Turno 2');
  assert.doesNotMatch(second, /Dado 1/);
});

test('múltiplos contextos: combinações de estilo e presença de textos não quebram nem vazam undefined', () => {
  const scenarios = [
    { llmText: 'A', toolResponseText: 'B.', conversationStyle: 'simple' },
    { llmText: 'A', toolResponseText: 'B.', conversationStyle: 'normal' },
    { llmText: 'A', toolResponseText: 'B.', conversationStyle: 'detailed' },
    { llmText: null, toolResponseText: 'B.', conversationStyle: 'simple' },
    { llmText: 'A', toolResponseText: null, conversationStyle: 'simple' },
    { llmText: null, toolResponseText: null, conversationStyle: 'simple' },
  ];
  for (const scenario of scenarios) {
    const text = composeFinalResponseText(scenario);
    assert.notEqual(text, 'undefined undefined');
    assert.ok(text === null || typeof text === 'string');
  }
});

test('conversationStyle ausente usa o padrão simple (só a conclusão)', () => {
  const text = composeFinalResponseText({ llmText: 'A', toolResponseText: 'B.' });
  assert.equal(text, 'B.');
});
