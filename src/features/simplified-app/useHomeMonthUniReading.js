import { useEffect, useMemo, useRef, useState } from 'react';
import { requestUniInsights } from '../../services/uniInsightsService.js';
import {
  readUniReadingCache,
  writeUniReadingFailure,
  writeUniReadingSuccess,
} from './homeMonthUniReading.js';

// Sem localStorage (aba anônima, armazenamento bloqueado), a memória da aba
// guarda a leitura: voltar para a Home não gasta outra geração.
const memoryEntries = new Map();
const memoryStorage = Object.freeze({
  getItem: (key) => (memoryEntries.has(key) ? memoryEntries.get(key) : null),
  setItem: (key, value) => {
    memoryEntries.set(key, String(value));
  },
});

function getStorage() {
  try {
    const storage = window.localStorage;
    storage.setItem('uniflow:leitura-do-mes:teste', '1');
    storage.removeItem('uniflow:leitura-do-mes:teste');
    return storage;
  } catch {
    return memoryStorage;
  }
}

// Um pedido por usuário, espaço e fatos, mesmo que a Home remonte ou os dados
// cheguem de novo iguais no meio do caminho. O cache é gravado aqui, e não no
// componente: a geração já paga fica guardada mesmo se a pessoa sair da Home.
const inflight = new Map();
// Último pedido de cada usuário e espaço. Dois lançamentos seguidos geram dois
// pedidos; a resposta do mais antigo, se chegar depois, não apaga a do novo.
const latestRequest = new Map();

function generate({ key, userId, workspaceId, fingerprint, payload }) {
  if (inflight.has(key)) return inflight.get(key);
  const owner = `${userId}|${workspaceId}`;
  latestRequest.set(owner, key);
  const promise = requestUniInsights(payload)
    .then(({ leituras, error }) => {
      const storage = getStorage();
      const now = new Date();
      if (latestRequest.get(owner) !== key) {
        return leituras ? { leituras, generatedAt: now.toISOString() } : { leituras: null, generatedAt: null };
      }
      if (leituras) {
        writeUniReadingSuccess(storage, { userId, workspaceId, fingerprint, leituras, now });
        return { leituras, generatedAt: now.toISOString() };
      }
      writeUniReadingFailure(storage, { userId, workspaceId, fingerprint, errorCode: error?.code, now });
      return { leituras: null, generatedAt: null };
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/**
 * Frases da Uni para a Leitura do mês (#122).
 * status:
 * - 'off': sem fatos para ler (ou ainda carregando os dados);
 * - 'loading': a Uni está escrevendo; `leituras` traz as de hoje para fatos
 *   anteriores, quando houver, para a tela não piscar;
 * - 'ready': `leituras` são da Uni para estes fatos;
 * - 'fallback': a Home mostra a leitura calculada.
 *
 * pause: um recarregamento está no meio (os lançamentos chegaram e as
 * categorias ainda não, por exemplo). Os fatos desse meio-tempo são
 * passageiros e não podem gastar uma geração: vale a impressão anterior.
 */
export function useHomeMonthUniReading({ userId, workspaceId, payload, fingerprint, enabled, pause = false }) {
  const candidateKey = enabled && userId && workspaceId && payload ? `${userId}|${workspaceId}|${fingerprint}` : null;
  const [stable, setStable] = useState({ key: candidateKey, fingerprint, payload });
  if (!pause && stable.key !== candidateKey) setStable({ key: candidateKey, fingerprint, payload });
  const active = pause ? stable : { key: candidateKey, fingerprint, payload };
  const { key } = active;
  // O pedido só muda junto com a impressão; o ref evita refazer a chamada
  // quando os mesmos dados chegam num objeto novo.
  const payloadRef = useRef(active.payload);
  // Roda antes do efeito que chama a Uni (mesma ordem de declaração).
  useEffect(() => {
    payloadRef.current = active.payload;
  });

  const cached = useMemo(
    () => (key ? readUniReadingCache(getStorage(), { userId, workspaceId, fingerprint: active.fingerprint }) : null),
    // key já carrega userId, workspaceId e fingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const [result, setResult] = useState({ key: null, leituras: null, generatedAt: null });

  useEffect(() => {
    if (!key || !cached || cached.status === 'ready' || cached.status === 'blocked') return undefined;
    let ignore = false;
    generate({ key, userId, workspaceId, fingerprint: active.fingerprint, payload: payloadRef.current }).then((generated) => {
      if (!ignore) setResult({ key, ...generated });
    });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cached]);

  if (!key) return { status: 'off', leituras: null, generatedAt: null };
  if (result.key === key) {
    return result.leituras
      ? { status: 'ready', leituras: result.leituras, generatedAt: result.generatedAt }
      : { status: 'fallback', leituras: null, generatedAt: null };
  }
  if (cached.status === 'ready') return { status: 'ready', leituras: cached.readings, generatedAt: cached.generatedAt };
  if (cached.status === 'blocked') return { status: 'fallback', leituras: null, generatedAt: null };
  if (cached.status === 'stale') return { status: 'loading', leituras: cached.readings, generatedAt: cached.generatedAt };
  return { status: 'loading', leituras: null, generatedAt: null };
}
