import assert from 'node:assert/strict';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../featureFlags.js';
import {
  adaptPersonality,
  COMMUNICATION_EMOTIONS,
  composeCommunication,
  createCommunicationSnapshot,
  resolveCommunicationEmotion,
  runCommunicationShadow,
  UNI_OS_COMMUNICATION_SCHEMA_VERSION,
} from './index.js';

const NOW = '2026-07-13T03:00:00.000Z';
const OPTIONS = Object.freeze({ now: () => NOW, idFactory: () => 'communication-001' });

function structuredResponse(overrides = {}) {
  return {
    facts: { parsedIntent: { intent: 'question' }, context: {}, memory: {} },
    reflection: { overallRisk: 'LOW' },
    security: { status: 'ALLOW', risk: 'LOW' },
    permissions: { status: 'AUTHORIZED' },
    executionAllowed: false,
    ...overrides,
  };
}

function communicationInput(overrides = {}) {
  return {
    structuredResponse: structuredResponse(),
    contextSnapshot: { personality: { mode: 'balanced' } },
    memorySnapshot: { preferences: { conversation: [] } },
    ...overrides,
  };
}

test('Emotion suporta os dez estados por sinais estruturados', () => {
  const cases = [
    [{}, 'CALM'],
    [{ response: { facts: { parsedIntent: { attentionType: 'financial_question' } } } }, 'OBJECTIVE'],
    [{ response: { facts: { parsedIntent: { attentionType: 'explanation' } } } }, 'EDUCATIONAL'],
    [{ context: { situation: 'uncertainty' } }, 'EMPATHETIC'],
    [{ context: { situation: 'progress' } }, 'ENCOURAGING'],
    [{ context: { situation: 'celebration' } }, 'CELEBRATING'],
    [{ response: { security: { status: 'BLOCK' } } }, 'CAREFUL'],
    [{ response: { facts: { parsedIntent: { attentionType: 'emergency' } } } }, 'URGENT'],
    [{ response: { facts: { parsedIntent: { attentionType: 'planning' } } } }, 'FOCUSED'],
    [{ context: { situation: 'support' } }, 'SUPPORTIVE'],
  ];
  cases.forEach(([signals, expected]) => {
    const emotion = resolveCommunicationEmotion({
      structuredResponse: structuredResponse(signals.response),
      contextSnapshot: signals.context,
    });
    assert.equal(emotion, expected);
  });
  assert.equal(COMMUNICATION_EMOTIONS.length, 10);
});

test('risco alto usa CAREFUL sem alterar fatos', () => {
  const response = structuredResponse({ reflection: { overallRisk: 'HIGH' } });
  const before = structuredClone(response);
  assert.equal(resolveCommunicationEmotion({ structuredResponse: response }), 'CAREFUL');
  assert.deepEqual(response, before);
});

test('Personality representa somente os quatro perfis existentes', () => {
  const expected = {
    balanced: 'DIDACTIC',
    direct: 'MINIMALIST',
    warm: 'FRIENDLY',
    strategic: 'EXECUTIVE',
  };
  Object.entries(expected).forEach(([mode, personality]) => {
    assert.equal(adaptPersonality({ contextSnapshot: { personality: { mode } } }).personality, personality);
  });
});

test('preferência explícita da memória prevalece sem ser alterada', () => {
  const memorySnapshot = { preferences: { conversation: [{ mode: 'warm' }] } };
  const before = structuredClone(memorySnapshot);
  const result = adaptPersonality({
    contextSnapshot: { personality: { mode: 'direct' } },
    memorySnapshot,
  });
  assert.equal(result.personality, 'FRIENDLY');
  assert.deepEqual(memorySnapshot, before);
});

test('personalidade inválida usa o perfil balanced existente', () => {
  const result = adaptPersonality({ contextSnapshot: { personality: { mode: 'invented' } } });
  assert.equal(result.personality, 'DIDACTIC');
  assert.equal(result.communicationStyle, 'BALANCED_GUIDANCE');
});

test('Tone acompanha emoção sem produzir frases', () => {
  const result = composeCommunication(communicationInput({
    structuredResponse: structuredResponse({
      facts: { parsedIntent: { attentionType: 'emergency' } },
    }),
  }), OPTIONS);
  assert.equal(result.emotion, 'URGENT');
  assert.equal(result.tone, 'urgent_calm');
  assert.equal('text' in result, false);
});

test('Verbosity preserva configuração representada pelo perfil', () => {
  const direct = composeCommunication(communicationInput({
    contextSnapshot: { personality: { mode: 'direct' } },
  }), OPTIONS);
  const strategic = composeCommunication(communicationInput({
    contextSnapshot: { personality: { mode: 'strategic' } },
  }), OPTIONS);
  assert.equal(direct.verbosity, 'CONCISE');
  assert.equal(strategic.verbosity, 'STRUCTURED');
});

test('CommunicationStyle segue o perfil sem mudar decisões', () => {
  const result = composeCommunication(communicationInput({
    contextSnapshot: { personality: { mode: 'warm' } },
  }), OPTIONS);
  assert.equal(result.communicationStyle, 'WARM_GUIDANCE');
  assert.equal(result.executionAllowed, false);
});

test('schema cria contrato com identidade e versão', () => {
  const result = composeCommunication(communicationInput(), OPTIONS);
  assert.equal(result.communicationId, 'communication-001');
  assert.equal(result.timestamp, NOW);
  assert.equal(result.metadata.version, UNI_OS_COMMUNICATION_SCHEMA_VERSION);
});

test('schema é profundamente imutável', () => {
  const result = createCommunicationSnapshot({ emotion: 'CALM' });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.metadata), true);
});

test('schema bloqueia output, voz e execução mesmo com entrada maliciosa', () => {
  const result = createCommunicationSnapshot({
    outputChannel: 'voice', voiceProfile: 'external', executionAllowed: true,
  });
  assert.equal(result.outputChannel, null);
  assert.equal(result.voiceProfile, null);
  assert.equal(result.executionAllowed, false);
  assert.equal('ssml' in result, false);
  assert.equal('prompt' in result, false);
});

test('objetos vazios usam comunicação balanced segura', () => {
  const result = composeCommunication({}, OPTIONS);
  assert.equal(result.emotion, 'CALM');
  assert.equal(result.personality, 'DIDACTIC');
  assert.equal(result.verbosity, 'BALANCED');
  assert.equal(result.communicationStyle, 'BALANCED_GUIDANCE');
});

test('composer não modifica structuredResponse, contexto ou memória', () => {
  const input = communicationInput();
  const before = structuredClone(input);
  composeCommunication(input, OPTIONS);
  assert.deepEqual(input, before);
});

test('feature flag compartilhada permanece desligada', async () => {
  let observed = false;
  const result = await runCommunicationShadow({}, { observer: () => { observed = true; } });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(observed, false);
});

test('modo sombra observa comunicação e descarta resultado', async () => {
  let observed = null;
  const result = await runCommunicationShadow(communicationInput(), {
    enabled: true,
    adapterOptions: OPTIONS,
    observer: async (communication) => { observed = communication; },
  });
  assert.equal(observed.communicationId, 'communication-001');
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.communication, null);
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runCommunicationShadow({}, {
    enabled: true,
    observer: async () => { throw new Error('internal'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
  assert.equal(result.communication, null);
});

test('logs DEV contêm somente metadados de comunicação', async () => {
  const logs = [];
  await runCommunicationShadow(communicationInput({
    structuredResponse: structuredResponse({
      facts: { parsedIntent: { intent: 'question', originalText: 'dado privado 80' } },
    }),
  }), {
    enabled: true,
    isDevelopment: true,
    adapterOptions: OPTIONS,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /\[UNI OS\] Communication/);
  assert.doesNotMatch(serialized, /privado|originalText|80/i);
});
