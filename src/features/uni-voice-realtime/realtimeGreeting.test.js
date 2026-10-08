import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildRealtimeGreetingEvent, buildRealtimeGreetingInstructions } from './realtimeGreeting.js';

const HOOK = readFileSync(new URL('./useRealtimeVoiceSession.js', import.meta.url), 'utf8');
const HOME = readFileSync(new URL('../simplified-app/SimplifiedHomeView.jsx', import.meta.url), 'utf8');

// Épico #116: a Uni fala primeiro ao abrir a conversa, com a voz da conversa.

test('a primeira fala usa a saudação da Home como ideia, curta e sem dados financeiros', () => {
  const text = buildRealtimeGreetingInstructions({ suggestedGreeting: 'Boa noite, Jonatas! Como posso te ajudar hoje?' });
  assert.match(text, /^Comece a conversa agora, antes de a pessoa falar\./);
  assert.match(text, /"Boa noite, Jonatas! Como posso te ajudar hoje\?"/);
  assert.match(text, /No máximo duas frases curtas\. Não cite valores nem dados financeiros\./);
  assert.doesNotMatch(text, /rascunho/);
});

test('rascunho pendente entra na primeira fala', () => {
  assert.match(buildRealtimeGreetingInstructions({ suggestedGreeting: 'Oi!', hasPendingDraft: true }), /rascunho de lançamento na tela esperando confirmação/);
});

test('sem saudação sugerida, a Uni cumprimenta do jeito dela; texto longo é cortado', () => {
  assert.match(buildRealtimeGreetingInstructions({}), /Cumprimente a pessoa com calor, em poucas palavras\./);
  const long = buildRealtimeGreetingInstructions({ suggestedGreeting: 'a'.repeat(500) });
  assert.ok(!long.includes('a'.repeat(161)));
});

test('o pedido vai como response.create com instruções só para esta resposta', () => {
  assert.deepEqual(buildRealtimeGreetingEvent('Oi'), { type: 'response.create', response: { instructions: 'Oi' } });
});

test('o hook pede a primeira fala assim que o canal abre, e a Home manda a saudação de texto', () => {
  assert.match(HOOK, /if \(greetingInstructions\) sendEvent\(channel, buildRealtimeGreetingEvent\(greetingInstructions\)\);/);
  assert.match(HOME, /suggestedGreeting: greeting\.spokenGreeting,/);
});

test('com a conversa em tempo real, a Home não fala sozinha ao abrir o app', () => {
  assert.match(HOME, /const voiceEnabled = voicePreferenceEnabled && !realtimeVoiceEnabled;/);
});

test('com a conversa em tempo real, o texto da Home diz como começar a conversar', () => {
  assert.match(HOME, /Toque na <strong>Uni<\/strong>, no centro da barra abaixo, para conversar por voz\./);
});

test('fala depois de ferramenta espera a resposta que chamou a ferramenta terminar', () => {
  assert.doesNotMatch(HOOK, /call_id: event\.call_id[\s\S]{0,120}sendEvent\(connection\.channel, \{ type: 'response\.create' \}\)/);
  assert.match(HOOK, /if \(connection\.responseActive\) \{\s*connection\.responseRequested = true;/);
  assert.match(HOOK, /if \(connection\.responseRequested\) \{\s*connection\.responseRequested = false;\s*requestResponse\(connection\);/);
});
