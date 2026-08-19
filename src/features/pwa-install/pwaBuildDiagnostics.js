// PWA-UPDATE3: prova (nunca infere) qual build cada uma das tres camadas
// esta realmente rodando -- runtime (JS atual em execucao), server
// (version.json, a "verdade" do deploy mais recente) e SW (o Service
// Worker que hoje controla esta pagina, via build-id-bridge.js).
//
// Nunca mostrado a um usuario comum -- so alimenta a decisao de recovery
// automatico (pwaUpdateStore.js) e, se necessario, um log sanitizado/
// diagnostico interno.

const DEFAULT_QUERY_TIMEOUT_MS = 2_000;

/**
 * Pergunta ao Service Worker ATUALMENTE em controle desta pagina qual
 * buildId ele carrega, via MessageChannel (request/response real, nao um
 * palpite). Retorna `null` quando nao ha controller, o SW nao responde a
 * tempo, ou a API nao existe no ambiente -- nunca lanca.
 */
export function queryServiceWorkerBuildId({
  serviceWorker = globalThis.navigator?.serviceWorker,
  runtime = globalThis,
  timeoutMs = DEFAULT_QUERY_TIMEOUT_MS,
} = {}) {
  const controller = serviceWorker?.controller;
  if (!controller?.postMessage || typeof runtime.MessageChannel !== 'function') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const channel = new runtime.MessageChannel();
    const finish = (value) => {
      if (settled) return;
      settled = true;
      runtime.clearTimeout?.(timeoutId);
      channel.port1.onmessage = null;
      resolve(value);
    };

    channel.port1.onmessage = (event) => {
      const buildId = event?.data?.buildId;
      finish(typeof buildId === 'string' && buildId ? buildId : null);
    };
    const timeoutId = runtime.setTimeout?.(() => finish(null), timeoutMs);

    try {
      controller.postMessage({ type: 'UNIFLOW_GET_BUILD_ID' }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}

export const BUILD_COHERENCE = Object.freeze({
  COHERENT: 'coherent',
  // SW ainda nao respondeu/nao existe controller -- comum logo apos o
  // primeiro load, ou em navegadores sem SW. Nunca tratado como
  // incoerencia real.
  SW_UNKNOWN: 'sw_unknown',
  // O caso que este modulo existe para provar: o runtime atual (JS em
  // memoria) diverge do que o servidor diz ser o build mais recente.
  RUNTIME_STALE: 'runtime_stale',
  // O SW ativo diverge do runtime -- sinal mais forte de estado
  // "misturado" (o controller que vai responder a proxima navegacao/
  // fetch nao e o mesmo build que esta rodando agora).
  SW_MISMATCHED: 'sw_mismatched',
});

/**
 * Compara runtime/server/SW e devolve um veredito unico -- nunca deixa a
 * decisao de recovery espalhada em comparacoes soltas noutros arquivos.
 */
export function evaluateBuildCoherence({ runtimeBuildId, serverBuildId, swBuildId }) {
  if (!runtimeBuildId || runtimeBuildId === 'development' || !serverBuildId) {
    return BUILD_COHERENCE.COHERENT;
  }
  if (runtimeBuildId !== serverBuildId) return BUILD_COHERENCE.RUNTIME_STALE;
  if (swBuildId && swBuildId !== runtimeBuildId) return BUILD_COHERENCE.SW_MISMATCHED;
  if (!swBuildId) return BUILD_COHERENCE.SW_UNKNOWN;
  return BUILD_COHERENCE.COHERENT;
}

/**
 * Snapshot sanitizado para diagnostico interno/log -- so identificadores
 * de build e plataforma, nunca dados do usuario.
 */
export async function getPwaDiagnosticSnapshot({
  runtimeBuildId,
  serverBuildId,
  runtime = globalThis,
} = {}) {
  const swBuildId = await queryServiceWorkerBuildId({ runtime, serviceWorker: runtime.navigator?.serviceWorker });
  const coherence = evaluateBuildCoherence({ runtimeBuildId, serverBuildId, swBuildId });

  return Object.freeze({
    platform: typeof runtime.navigator?.platform === 'string' ? runtime.navigator.platform : null,
    userAgent: typeof runtime.navigator?.userAgent === 'string' ? runtime.navigator.userAgent.slice(0, 160) : null,
    standalone: Boolean(
      runtime.matchMedia?.('(display-mode: standalone)')?.matches || runtime.navigator?.standalone === true,
    ),
    runtimeBuildId: runtimeBuildId ?? null,
    serverBuildId: serverBuildId ?? null,
    swBuildId,
    coherence,
  });
}
