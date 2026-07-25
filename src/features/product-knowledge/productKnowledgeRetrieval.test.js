import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieveProductKnowledge } from './productKnowledgeRetrieval.js';
import { KNOWLEDGE_STATUS } from './productKnowledgeManifest.js';

test('encontra o documento de login para "como faço login com o Google"', () => {
  const { matched, results } = retrieveProductKnowledge('como faço login com o Google');
  assert.ok(matched);
  assert.ok(results.some((r) => r.id === 'authentication-and-onboarding'));
});

test('encontra o documento de workspaces para "como alterno entre pessoal e empresa"', () => {
  const { results } = retrieveProductKnowledge('como alterno entre pessoal e empresa');
  assert.ok(results.some((r) => r.id === 'workspaces-pf-pj'));
});

test('encontra o documento financeiro para "como registro uma movimentação"', () => {
  const { results } = retrieveProductKnowledge('como registro uma movimentação de despesa');
  assert.ok(results.some((r) => r.id === 'financial-management'));
});

test('encontra o documento de objetivos para "onde encontro meus objetivos"', () => {
  const { results } = retrieveProductKnowledge('onde encontro meus objetivos');
  assert.ok(results.some((r) => r.id === 'goals'));
});

test('encontra o documento de voz para "como ouço uma resposta da Uni"', () => {
  const { results } = retrieveProductKnowledge('como ouço uma resposta da Uni');
  assert.ok(results.some((r) => r.id === 'uni-voice'));
});

test('encontra o documento de voz para pergunta sobre créditos ao repetir áudio', () => {
  const { results } = retrieveProductKnowledge('a voz reproduz de novo sem gastar novos créditos?');
  assert.ok(results.some((r) => r.id === 'uni-voice'));
  const entry = results.find((r) => r.id === 'uni-voice');
  assert.match(entry.content, /reaproveita/);
});

test('nunca retorna mais que o limite (padrão)', () => {
  const { results } = retrieveProductKnowledge('conta despesa receita meta agenda cliente projeto');
  assert.ok(results.length <= 3);
});

test('respeita um limite customizado', () => {
  const { results } = retrieveProductKnowledge('conta despesa receita meta agenda cliente projeto', { limit: 1 });
  assert.equal(results.length, 1);
});

test('nenhum resultado tem conteúdo maior que o teto de truncamento', () => {
  const { results } = retrieveProductKnowledge('financeiro despesa receita categoria open finance banco relatório', { limit: 5 });
  for (const r of results) {
    assert.ok(r.content.length <= 601);
  }
});

test('nunca retorna resultados duplicados (mesmo id duas vezes)', () => {
  const { results } = retrieveProductKnowledge('uni voz chat conversa ouvir');
  const ids = results.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('filtro por workspace business inclui BOTH e BUSINESS, exclui PERSONAL-only', () => {
  const { results } = retrieveProductKnowledge('cliente oportunidade crm', { workspace: 'business' });
  assert.ok(results.some((r) => r.id === 'crm-and-clients'));
});

test('filtro por workspace personal nunca retorna documento exclusivo de empresa (crm-and-clients)', () => {
  const { results } = retrieveProductKnowledge('cliente oportunidade crm pipeline', { workspace: 'personal' });
  assert.ok(!results.some((r) => r.id === 'crm-and-clients'));
});

test('pergunta sobre funcionalidade futura (upgrade de plano) retorna o documento com status não-available', () => {
  const { results } = retrieveProductKnowledge('como faço upgrade do meu plano');
  const entry = results.find((r) => r.id === 'plans-and-limitations');
  assert.ok(entry);
  assert.notEqual(entry.status, KNOWLEDGE_STATUS.AVAILABLE);
});

test('pergunta sobre integração bancária real retorna open finance como demo, não como disponível', () => {
  const { results } = retrieveProductKnowledge('existe integração bancária real no aplicativo?');
  const entry = results.find((r) => r.id === 'financial-management');
  assert.ok(entry);
  assert.match(entry.content, /DEMONSTRAÇÃO VISUAL/);
});

test('pergunta totalmente desconhecida não retorna nada (fallback)', () => {
  const { matched, results } = retrieveProductKnowledge('futebol campeonato jogador estádio torcida gol arbitragem');
  assert.equal(matched, false);
  assert.equal(results.length, 0);
});

test('string vazia não retorna nada', () => {
  const { matched, results } = retrieveProductKnowledge('');
  assert.equal(matched, false);
  assert.equal(results.length, 0);
});

test('pontuação no fim da pergunta não impede o casamento da última palavra (regressão)', () => {
  const withQuestionMark = retrieveProductKnowledge('Onde encontro meus objetivos?');
  assert.equal(withQuestionMark.results[0]?.id, 'goals');
});

test('perguntas dominadas por palavras funcionais (stopwords) ainda encontram o documento certo em primeiro lugar', () => {
  const { results } = retrieveProductKnowledge('Como faço login com o Google?');
  assert.equal(results[0]?.id, 'authentication-and-onboarding');
});

test('busca é insensível a acentuação e caixa', () => {
  const lower = retrieveProductKnowledge('agenda compromisso tarefa');
  const upperAccented = retrieveProductKnowledge('AGENDA COMPROMISSO TAREFA');
  assert.deepEqual(
    lower.results.map((r) => r.id),
    upperAccented.results.map((r) => r.id),
  );
});
