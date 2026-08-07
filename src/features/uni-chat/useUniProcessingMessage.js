import { useEffect, useMemo, useState } from 'react';
import { buildProcessingRotationPlan, getProcessingMessageSequence } from './uniProcessingMessages.js';

/**
 * FASE ESTADOS DE PROCESSAMENTO: hook fino e ÚNICO (compartilhado entre a
 * Home compacta e o chat completo -- nunca duplicado) que converte um
 * estado real do pipeline em uma mensagem humana rotativa. Toda a lógica de
 * conteúdo/ritmo vive em uniProcessingMessages.js (puro, testável sem
 * timers); este hook só agenda/cancela os timeouts.
 *
 * `context` deve ser um objeto simples serializável (ex.: { actionKind }) --
 * o hook usa uma chave serializada para decidir quando a sequência
 * realmente mudou, então o chamador pode passar um objeto literal novo a
 * cada render sem disparar timers extras.
 */
export function useUniProcessingMessage(state, context = {}) {
  const contextKey = context && typeof context === 'object' ? JSON.stringify(context) : String(context);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- contextKey já resume o context inteiro (evita recomputar só porque o chamador passou um objeto literal novo com o mesmo conteúdo)
  const sequence = useMemo(() => getProcessingMessageSequence(state, context), [state, contextKey]);

  const [index, setIndex] = useState(0);
  // Reseta o índice quando a sequência muda (novo estado/contexto) --
  // ajustado durante a renderização (não em efeito), mesmo padrão já usado
  // no projeto para resetar estado quando uma "key" muda:
  // https://react.dev/learn/you-might-not-need-an-effect
  const [prevSequence, setPrevSequence] = useState(sequence);
  if (sequence !== prevSequence) {
    setPrevSequence(sequence);
    setIndex(0);
  }

  useEffect(() => {
    const plan = buildProcessingRotationPlan(sequence.length);
    if (!plan.length) return undefined;
    const timers = plan.map(({ index: nextIndex, delayMs }) => (
      window.setTimeout(() => setIndex(nextIndex), delayMs)
    ));
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [sequence]);

  return sequence[index] ?? null;
}
