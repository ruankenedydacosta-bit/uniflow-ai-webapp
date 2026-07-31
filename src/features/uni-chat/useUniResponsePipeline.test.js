// Testes do Pipeline Oficial de Resposta da Uni (texto + voz).
//
// Verifica o contrato do pipeline: toda resposta da Uni passa por
// runAssistantResponsePipeline na ordem criação → persistência →
// render → autoplay → fala, com deduplicação via spokenMessageSession
// (mesmo registro do efeito de autoplay) e gates de autoplay idênticos aos
// do efeito — quando os gates fecham, a mensagem fica SEM marca e o efeito
// a narra depois (nunca órfã, nunca duplicada).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runAssistantResponsePipeline } from './useUniResponsePipeline.js';
import {
  hasAutoSpokenMessage,
  markAutoSpokenMessage,
  resetAutoSpokenMessages,
} from '../uni-voice-tts/spokenMessageSession.js';
import {
  hasNarratedText,
  markNarratedText,
  resetNarratedTexts,
} from '../uni-voice-tts/narratedTextSession.js';
import {
  buildWelcomeSessionKey,
  claimWelcomeVoice,
  isWelcomeVoicePending,
  markWelcomeVoiceSettled,
  resetWelcomeVoiceSessions,
} from '../simplified-app/welcomeVoiceSession.js';

const USER_ID = 'user-1';

beforeEach(() => {
  resetAutoSpokenMessages();
  resetWelcomeVoiceSessions();
  resetNarratedTexts();
});

function setup({
  shouldAutoSpeak = () => true,
  persist = true,
  autoplay = true,
  messageOptions = {},
  hasSpoken = hasAutoSpokenMessage,
  markSpoken = markAutoSpokenMessage,
} = {}) {
  const calls = { build: [], persist: [], push: [], speak: [], order: [] };
  const messages = [];
  let nextId = 1;
  const buildMessage = (text, options) => {
    const msg = { id: `msg-${nextId++}`, from: 'uni', text, ...options };
    calls.build.push({ text, options });
    calls.order.push(`build:${msg.id}`);
    messages.push(msg);
    return msg;
  };
  const persistMessage = (msg) => {
    calls.persist.push(msg);
    calls.order.push(`persist:${msg.id}`);
  };
  const pushMessage = (msg) => {
    calls.push.push(msg);
    calls.order.push(`push:${msg.id}`);
  };
  const speakMessage = (msg) => {
    calls.speak.push(msg);
    calls.order.push(`speak:${msg.id}`);
  };
  const result = runAssistantResponsePipeline({
    text: 'Olá!',
    options: { persist, autoplay, ...messageOptions },
    buildMessage,
    pushMessage,
    persistMessage,
    shouldAutoSpeak,
    hasSpoken,
    markSpoken,
    speakMessage,
    userId: USER_ID,
  });
  return { result, calls, buildMessage, persistMessage, pushMessage, speakMessage };
}

test('pipeline cria, persiste, renderiza e fala na ordem oficial (build → persist → push → speak)', () => {
  const { calls } = setup();
  assert.equal(calls.build.length, 1);
  assert.equal(calls.persist.length, 1);
  assert.equal(calls.push.length, 1);
  assert.equal(calls.speak.length, 1);
  const id = calls.order[0].split(':')[1];
  assert.deepEqual(calls.order, [
    `build:${id}`,
    `persist:${id}`,
    `push:${id}`,
    `speak:${id}`,
  ], 'a ordem é sempre: build → persist → push → speak');
});

test('a mensagem retornada tem o texto e as opções repassadas ao buildMessage', () => {
  const { result, calls } = setup({ messageOptions: { type: 'confirmation', highlight: ['saldo'] } });
  assert.equal(result.text, 'Olá!');
  assert.equal(calls.build[0].options.type, 'confirmation');
  assert.equal(calls.build[0].options.highlight[0], 'saldo');
});

test('persist=false não persiste, mas ainda renderiza e fala', () => {
  const { calls } = setup({ persist: false });
  assert.equal(calls.persist.length, 0);
  assert.equal(calls.push.length, 1);
  assert.equal(calls.speak.length, 1);
});

test('persistir é fire-and-forget: nunca bloqueia render nem fala (não-await no caller não importa aqui)', () => {
  const { calls } = setup({ persist: true });
  assert.equal(calls.persist.length, 1);
  assert.equal(calls.push.length, 1);
  assert.equal(calls.speak.length, 1);
});

test('gates de autoplay fechados (ex.: saudação ainda tocando): NÃO fala agora, NÃO marca -- o efeito de autoplay fala depois (nunca órfã, nunca duplicada)', () => {
  const { calls, result } = setup({ shouldAutoSpeak: () => false });
  assert.equal(calls.push.length, 1, 'mensagem sempre renderiza');
  assert.equal(calls.speak.length, 0, 'gates fechados: não fala agora');
  assert.equal(hasAutoSpokenMessage(USER_ID, result.id), false, 'não marca: o efeito de autoplay ainda vai narrar');
});

test('deadlock da saudação corrigido: claim → settled (markWelcomeVoiceSettled) → pending liberado → gates abrem → speakMessage volta a executar', () => {
  const key = buildWelcomeSessionKey({ id: USER_ID }, { expires_at: 12345 });

  // Saudação reivindicada: pending bloqueia o autoplay (gates fechados).
  assert.equal(claimWelcomeVoice(key), true);
  assert.equal(isWelcomeVoicePending(key), true);
  const shouldAutoSpeak = () => !isWelcomeVoicePending(key);
  const buildMessage = (text) => ({ id: 'msg-1', from: 'uni', text });
  const spoken = [];

  // Resposta chega com a saudação ainda pendente: renderiza, NÃO fala,
  // NÃO marca -- o efeito de autoplay narra depois que os gates abrirem.
  runAssistantResponsePipeline({
    text: 'Olá!',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(msg.id),
    userId: USER_ID,
  });
  assert.equal(spoken.length, 0, 'saudação pendente: não fala');
  assert.equal(hasAutoSpokenMessage(USER_ID, 'msg-1'), false, 'não marca: o efeito ainda vai narrar');

  // Saudação terminou ou falhou: finally → onWelcomeVoiceSettled →
  // markWelcomeVoiceSettled libera a chave (fix do deadlock).
  markWelcomeVoiceSettled(key);
  assert.equal(isWelcomeVoicePending(key), false, 'pendingWelcome não permanece preso');

  // Gates agora abrem: a MESMA mensagem (ainda sem marca) volta a ser
  // narrada pelo pipeline/efeito -- speakMessage é executado de novo.
  runAssistantResponsePipeline({
    text: 'Olá!',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(msg.id),
    userId: USER_ID,
  });
  assert.deepEqual(spoken, ['msg-1'], 'settled → speakMessage volta a ser executado');
  assert.equal(hasAutoSpokenMessage(USER_ID, 'msg-1'), true, 'marca no momento de falar');
});

test('autoplay=false (ex.: aviso de carregamento): mensagem renderiza, fica SEM marca e nunca fala no pipeline', () => {
  const { calls, result } = setup({ autoplay: false, shouldAutoSpeak: () => true });
  assert.equal(calls.push.length, 1);
  assert.equal(calls.speak.length, 0);
  assert.equal(hasAutoSpokenMessage(USER_ID, result.id), false);
});

test('deduplicação: mensagem já narrada no registro de sessão nunca fala de novo (mesmo registro do efeito de autoplay)', () => {
  const { calls } = setup({
    hasSpoken: () => true,
  });
  assert.equal(calls.push.length, 1, 'renderiza sempre');
  assert.equal(calls.speak.length, 0, 'já narrada: não fala de novo');
});

test('marca ANTES de falar: dentro de speakMessage o registro já está gravado -- um segundo pipeline (ou o efeito) nunca duplica', () => {
  let speakCalls = 0;
  let marked = false;
  const run = () => runAssistantResponsePipeline({
    text: 'Olá!',
    options: {},
    buildMessage: (text) => ({ id: 'msg-x', from: 'uni', text }),
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: () => marked,
    markSpoken: (userId, msgId) => {
      marked = true;
      assert.equal(userId, USER_ID);
      assert.equal(msgId, 'msg-x');
    },
    speakMessage: () => {
      speakCalls += 1;
      assert.equal(marked, true, 'a marca aconteceu ANTES da fala');
    },
    userId: USER_ID,
  });
  run();
  run();
  assert.equal(speakCalls, 1, 'segunda chamada com a mesma mensagem não fala de novo');
  assert.equal(marked, true);
});

test('buildMessage retornando null aborta o pipeline sem side effects', () => {
  const calls = { persist: 0, push: 0, speak: 0 };
  const result = runAssistantResponsePipeline({
    text: 'Olá!',
    options: {},
    buildMessage: () => null,
    pushMessage: () => { calls.push += 1; },
    persistMessage: () => { calls.persist += 1; },
    shouldAutoSpeak: () => true,
    hasSpoken: () => false,
    markSpoken: () => {},
    speakMessage: () => { calls.speak += 1; },
    userId: USER_ID,
  });
  assert.equal(result, null);
  assert.equal(calls.persist, 0);
  assert.equal(calls.push, 0);
  assert.equal(calls.speak, 0);
});

test('respostas em sequência no mesmo tick: a primeira marca e fala; a segunda também fala (ids diferentes, nunca truncadas)', () => {
  resetAutoSpokenMessages();
  const buildMessage = (text) => ({ id: `msg-${text}`, from: 'uni', text });
  const spoken = [];
  runAssistantResponsePipeline({
    text: 'Primeira resposta',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(msg.text),
    userId: USER_ID,
  });
  runAssistantResponsePipeline({
    text: 'Segunda resposta',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(msg.text),
    userId: USER_ID,
  });
  assert.deepEqual(spoken, ['Primeira resposta', 'Segunda resposta']);
  resetAutoSpokenMessages();
});

// ============================================================================
// DEDUP DE NARRAÇÃO POR CONTEÚDO (narratedTextSession.js) — BUG REAL: a Uni
// falava duas vezes a mesma resposta quando o mesmo input era entregue duas
// vezes (ex.: double-fire do transcript de voz ao responder "Caixa"): cada
// createAssistantResponse gerava uma mensagem NOVA (id novo) com o MESMO
// texto, e o dedup por id não pegava. Regra: dois creates com o mesmo
// conteúdo → somente o primeiro narra; a repetida continua renderizando e
// é marcada como falada por id (o efeito de autoplay nunca a narra depois).
// ============================================================================

test('dedup por conteúdo: duas respostas com o MESMO texto narram uma única vez; as duas renderizam e as duas são marcadas por id', () => {
  const buildMessage = (text) => ({ id: `msg-${text.length}-${Math.random()}`, from: 'uni', text });
  const spoken = [];
  const first = runAssistantResponsePipeline({
    text: 'Não encontrei a conta Caixa neste espaço. Posso criá-la para continuar a movimentação?',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(msg.text),
    userId: USER_ID,
    hasNarratedText,
    markNarratedText,
  });
  const second = runAssistantResponsePipeline({
    text: 'Não encontrei a conta Caixa neste espaço. Posso criá-la para continuar a movimentação?',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(msg.text),
    userId: USER_ID,
    hasNarratedText,
    markNarratedText,
  });
  assert.equal(spoken.length, 1, 'somente o primeiro create com o mesmo conteúdo narra');
  assert.equal(hasNarratedText(USER_ID, 'Não encontrei a conta Caixa neste espaço. Posso criá-la para continuar a movimentação?'), true);
  assert.equal(hasAutoSpokenMessage(USER_ID, first.id), true, 'primeira marcada no momento de falar');
  assert.equal(hasAutoSpokenMessage(USER_ID, second.id), true, 'repetida também marcada por id -- o efeito de autoplay nunca a narra depois');
});

test('dedup por conteúdo: textos diferentes narram todos, mesmo no mesmo tick', () => {
  const buildMessage = (text) => ({ id: `msg-${text.length}`, from: 'uni', text });
  const spoken = [];
  runAssistantResponsePipeline({
    text: 'Você tem R$ 100,00 na conta Caixa.',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(msg.text),
    userId: USER_ID,
    hasNarratedText,
    markNarratedText,
  });
  runAssistantResponsePipeline({
    text: 'Conta Caixa criada. Retomei a movimentação do ponto em que paramos.',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(msg.text),
    userId: USER_ID,
    hasNarratedText,
    markNarratedText,
  });
  assert.deepEqual(spoken, [
    'Você tem R$ 100,00 na conta Caixa.',
    'Conta Caixa criada. Retomei a movimentação do ponto em que paramos.',
  ]);
});

test('dedup por conteúdo é chaveado por usuário: usuário B narra o mesmo texto que A já narrou', () => {
  const buildMessage = (text) => ({ id: `msg-${text.length}`, from: 'uni', text });
  const spoken = [];
  const run = (userId) => runAssistantResponsePipeline({
    text: 'Resposta idêntica para os dois usuários.',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(`${userId}:${msg.text}`),
    userId,
    hasNarratedText,
    markNarratedText,
  });
  run('user-a');
  run('user-b');
  assert.equal(spoken.length, 2, 'cada usuário narra o próprio texto');
});

test('dedup por conteúdo marca o TEXTO ANTES de falar: dentro de speakMessage a repetição já está bloqueada (mesmo padrão do mark por id)', () => {
  let nextId = 1;
  const narratedTextsAtSpeakTime = [];
  const buildMessage = (text) => ({ id: `msg-order-${nextId++}`, from: 'uni', text });
  const run = () => runAssistantResponsePipeline({
    text: 'Texto narrado exatamente uma vez.',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => {
      narratedTextsAtSpeakTime.push(hasNarratedText(USER_ID, msg.text));
    },
    userId: USER_ID,
    hasNarratedText,
    markNarratedText,
  });
  run();
  run();
  assert.deepEqual(narratedTextsAtSpeakTime, [true], 'primeira narração já vê o texto registrado; a repetição (id diferente, texto igual) nem chega a falar');
});

test('sem hasNarratedText/markNarratedText (uso antigo/outros consumidores) o pipeline mantém o comportamento anterior intacto', () => {
  let nextId = 1;
  const buildMessage = (text) => ({ id: `msg-legacy-${nextId++}`, from: 'uni', text });
  const spoken = [];
  runAssistantResponsePipeline({
    text: 'Mesmo texto duas vezes.',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(msg.text),
    userId: USER_ID,
  });
  runAssistantResponsePipeline({
    text: 'Mesmo texto duas vezes.',
    options: {},
    buildMessage,
    pushMessage: () => {},
    persistMessage: () => {},
    shouldAutoSpeak: () => true,
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    speakMessage: (msg) => spoken.push(msg.text),
    userId: USER_ID,
  });
  assert.equal(spoken.length, 2, 'sem o registro de conteúdo, mensagens de ids diferentes continuam narrando (comportamento legado preservado)');
});
