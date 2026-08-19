import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILD_COHERENCE,
  evaluateBuildCoherence,
  getPwaDiagnosticSnapshot,
  queryServiceWorkerBuildId,
} from './pwaBuildDiagnostics.js';

// PWA-UPDATE3: fake MessageChannel -- os dois ports sao ligados diretamente
// (sem structured clone real, ja que e um teste em um unico processo), mas
// o protocolo request/response (postMessage/onmessage) e o mesmo do
// navegador real, entao exercita o codigo de producao sem mock do proprio
// modulo.
class FakeMessageChannel {
  constructor() {
    const port1 = { onmessage: null };
    const port2 = { onmessage: null };
    port1.postMessage = (data) => { port2.onmessage?.({ data }); };
    port2.postMessage = (data) => { port1.onmessage?.({ data }); };
    this.port1 = port1;
    this.port2 = port2;
  }
}

function createRuntime({ withMessageChannel = true } = {}) {
  return {
    MessageChannel: withMessageChannel ? FakeMessageChannel : undefined,
    setTimeout,
    clearTimeout,
  };
}

function createController(respond) {
  return {
    postMessage(message, transfer) {
      respond?.(message, transfer?.[0]);
    },
  };
}

test('sem controller (nenhum SW no controle desta pagina) -- resolve null sem lançar', async () => {
  const result = await queryServiceWorkerBuildId({
    serviceWorker: {},
    runtime: createRuntime(),
  });
  assert.equal(result, null);
});

test('ambiente sem MessageChannel -- resolve null sem lançar, mesmo com controller presente', async () => {
  const result = await queryServiceWorkerBuildId({
    serviceWorker: { controller: createController(() => {}) },
    runtime: createRuntime({ withMessageChannel: false }),
  });
  assert.equal(result, null);
});

test('SW responde com buildId real -- prova (nao infere) o build do Service Worker ativo', async () => {
  const controller = createController((message, port) => {
    assert.equal(message.type, 'UNIFLOW_GET_BUILD_ID');
    port.postMessage({ type: 'UNIFLOW_SW_BUILD_ID', buildId: 'sw-build-42' });
  });
  const result = await queryServiceWorkerBuildId({
    serviceWorker: { controller },
    runtime: createRuntime(),
  });
  assert.equal(result, 'sw-build-42');
});

test('SW responde com buildId invalido (vazio/nao-string) -- trata como desconhecido, nunca lanca', async () => {
  const controller = createController((message, port) => {
    port.postMessage({ type: 'UNIFLOW_SW_BUILD_ID', buildId: '' });
  });
  const result = await queryServiceWorkerBuildId({
    serviceWorker: { controller },
    runtime: createRuntime(),
  });
  assert.equal(result, null);
});

test('SW nunca responde -- timeout resolve null, nunca trava a chamada', async () => {
  const controller = createController(() => {
    // Nunca responde -- simula SW travado/incomunicavel.
  });
  const result = await queryServiceWorkerBuildId({
    serviceWorker: { controller },
    runtime: createRuntime(),
    timeoutMs: 10,
  });
  assert.equal(result, null);
});

test('controller.postMessage lançando erro (ex.: worker morto) -- resolve null, nunca propaga', async () => {
  const controller = createController(() => {
    throw new Error('IPC channel closed');
  });
  const result = await queryServiceWorkerBuildId({
    serviceWorker: { controller },
    runtime: createRuntime(),
  });
  assert.equal(result, null);
});

test('resposta tardia depois do timeout nunca resolve duas vezes (settled trava o segundo finish)', async () => {
  let lateRespond;
  const controller = createController((message, port) => {
    lateRespond = () => port.postMessage({ type: 'UNIFLOW_SW_BUILD_ID', buildId: 'too-late' });
  });
  const result = await queryServiceWorkerBuildId({
    serviceWorker: { controller },
    runtime: createRuntime(),
    timeoutMs: 5,
  });
  assert.equal(result, null);
  assert.doesNotThrow(() => lateRespond());
});

test('evaluateBuildCoherence: runtime em development -- sempre COHERENT, mesmo com server/SW divergentes', () => {
  assert.equal(
    evaluateBuildCoherence({ runtimeBuildId: 'development', serverBuildId: 'build-b', swBuildId: 'build-c' }),
    BUILD_COHERENCE.COHERENT,
  );
});

test('evaluateBuildCoherence: sem serverBuildId ainda -- COHERENT (nada para comparar ainda)', () => {
  assert.equal(
    evaluateBuildCoherence({ runtimeBuildId: 'build-a', serverBuildId: null, swBuildId: null }),
    BUILD_COHERENCE.COHERENT,
  );
});

test('evaluateBuildCoherence: runtime diverge do server -- RUNTIME_STALE (o caso central do incidente)', () => {
  assert.equal(
    evaluateBuildCoherence({ runtimeBuildId: 'build-a', serverBuildId: 'build-b', swBuildId: null }),
    BUILD_COHERENCE.RUNTIME_STALE,
  );
});

test('evaluateBuildCoherence: runtime==server mas SW diverge -- SW_MISMATCHED (sinal mais forte de estado misturado)', () => {
  assert.equal(
    evaluateBuildCoherence({ runtimeBuildId: 'build-b', serverBuildId: 'build-b', swBuildId: 'build-a' }),
    BUILD_COHERENCE.SW_MISMATCHED,
  );
});

test('evaluateBuildCoherence: runtime==server mas SW ainda desconhecido -- SW_UNKNOWN, nunca tratado como incoerencia', () => {
  assert.equal(
    evaluateBuildCoherence({ runtimeBuildId: 'build-b', serverBuildId: 'build-b', swBuildId: null }),
    BUILD_COHERENCE.SW_UNKNOWN,
  );
});

test('evaluateBuildCoherence: os tres builds coincidem -- COHERENT', () => {
  assert.equal(
    evaluateBuildCoherence({ runtimeBuildId: 'build-b', serverBuildId: 'build-b', swBuildId: 'build-b' }),
    BUILD_COHERENCE.COHERENT,
  );
});

test('getPwaDiagnosticSnapshot: forma sanitizada -- so identificadores de build/plataforma, nunca dados do usuario', async () => {
  const controller = createController((message, port) => {
    port.postMessage({ type: 'UNIFLOW_SW_BUILD_ID', buildId: 'build-b' });
  });
  const runtime = {
    ...createRuntime(),
    navigator: {
      platform: 'iPhone',
      userAgent: 'Mozilla/5.0 (fake iOS UA)',
      standalone: true,
      serviceWorker: { controller },
    },
    matchMedia: () => ({ matches: false }),
  };

  const snapshot = await getPwaDiagnosticSnapshot({
    runtimeBuildId: 'build-b',
    serverBuildId: 'build-b',
    runtime,
  });

  assert.deepEqual(Object.keys(snapshot).sort(), [
    'coherence',
    'platform',
    'runtimeBuildId',
    'serverBuildId',
    'standalone',
    'swBuildId',
    'userAgent',
  ]);
  assert.equal(snapshot.platform, 'iPhone');
  assert.equal(snapshot.userAgent, 'Mozilla/5.0 (fake iOS UA)');
  assert.equal(snapshot.standalone, true);
  assert.equal(snapshot.runtimeBuildId, 'build-b');
  assert.equal(snapshot.serverBuildId, 'build-b');
  assert.equal(snapshot.swBuildId, 'build-b');
  assert.equal(snapshot.coherence, BUILD_COHERENCE.COHERENT);
});

test('getPwaDiagnosticSnapshot: userAgent longo é truncado em 160 caracteres -- nunca cresce sem limite no log', async () => {
  const runtime = {
    ...createRuntime(),
    navigator: { userAgent: 'x'.repeat(500) },
    matchMedia: () => ({ matches: false }),
  };
  const snapshot = await getPwaDiagnosticSnapshot({ runtimeBuildId: 'build-a', serverBuildId: 'build-a', runtime });
  assert.equal(snapshot.userAgent.length, 160);
});

test('getPwaDiagnosticSnapshot: standalone via matchMedia OU navigator.standalone -- qualquer um dos dois sinais basta', async () => {
  const runtimeViaMatchMedia = {
    ...createRuntime(),
    navigator: {},
    matchMedia: (query) => ({ matches: query === '(display-mode: standalone)' }),
  };
  const snapshotA = await getPwaDiagnosticSnapshot({
    runtimeBuildId: 'build-a',
    serverBuildId: 'build-a',
    runtime: runtimeViaMatchMedia,
  });
  assert.equal(snapshotA.standalone, true);

  const runtimeViaNavigator = {
    ...createRuntime(),
    navigator: { standalone: true },
  };
  const snapshotB = await getPwaDiagnosticSnapshot({
    runtimeBuildId: 'build-a',
    serverBuildId: 'build-a',
    runtime: runtimeViaNavigator,
  });
  assert.equal(snapshotB.standalone, true);
});

test('getPwaDiagnosticSnapshot: runtime/server coerentes mas SW ainda nao respondeu -- reflete SW_UNKNOWN, nunca finge coerencia', async () => {
  const snapshot = await getPwaDiagnosticSnapshot({
    runtimeBuildId: 'build-a',
    serverBuildId: 'build-a',
    runtime: { ...createRuntime(), navigator: {} },
  });
  assert.equal(snapshot.swBuildId, null);
  assert.equal(snapshot.coherence, BUILD_COHERENCE.SW_UNKNOWN);
});
