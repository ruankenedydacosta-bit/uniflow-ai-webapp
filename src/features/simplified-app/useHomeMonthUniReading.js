import { useEffect, useMemo, useRef, useState } from 'react';
import { requestUniInsights } from '../../services/uniInsightsService.js';
import {
  readUniReadingCache,
  writeUniReadingFailure,
  writeUniReadingSuccess,
} from './homeMonthUniReading.js';

function getStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// Um pedido por usuário, espaço e fatos, mesmo que a Home remonte ou os dados
// cheguem de novo iguais no meio do caminho. O cache é gravado aqui, e não no
// componente: a geração já paga fica guardada mesmo se a pessoa sair da Home.
const inflight = new Map();

function generate({ key, userId, workspaceId, fingerprint, payload }) {
  if (inflight.has(key)) return inflight.get(key);
  const promise = requestUniInsights(payload)
    .then(({ leituras, error }) => {
      const storage = getStorage();
      const now = new Date();
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
 */
export function useHomeMonthUniReading({ userId, workspaceId, payload, fingerprint, enabled }) {
  const key = enabled && userId && workspaceId && payload ? `${userId}|${workspaceId}|${fingerprint}` : null;
  // O pedido só muda junto com a impressão; o ref evita refazer a chamada
  // quando os mesmos dados chegam num objeto novo.
  const payloadRef = useRef(payload);
  // Roda antes do efeito que chama a Uni (mesma ordem de declaração).
  useEffect(() => {
    payloadRef.current = payload;
  });

  const cached = useMemo(
    () => (key ? readUniReadingCache(getStorage(), { userId, workspaceId, fingerprint }) : null),
    // key já carrega userId, workspaceId e fingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const [result, setResult] = useState({ key: null, leituras: null, generatedAt: null });

  useEffect(() => {
    if (!key || !cached || cached.status === 'ready' || cached.status === 'blocked') return undefined;
    let ignore = false;
    generate({ key, userId, workspaceId, fingerprint, payload: payloadRef.current }).then((generated) => {
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
