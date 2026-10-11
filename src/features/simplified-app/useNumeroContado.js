import { useEffect, useRef, useState } from 'react';
import { lerDuracao, planoDaContagem, prefereMovimentoReduzido, valorDaContagem } from '../../utils/movimento.js';
import { pulsar } from './movimentoDeSalvar.js';

// Número que conta do valor antigo ao novo, só quando o valor muda (#145,
// #146). Enquanto `segurar` está ligado (folha aberta, dado recarregando),
// a tela continua no valor de antes e conta quando ele desliga. Número à
// vista conta do que mostrava e pulsa no elemento de `elementoRef`.
// `esqueleto` diz que o número está escondido pelo carregamento: ao sair
// dele, conta a partir de zero, sem pulsar. Mudança no meio de uma
// contagem conta dali até o valor novo. Com Reduzir movimento, troca direto.
export function useNumeroContado(valor, { segurar = false, esqueleto = false } = {}) {
  // Valor parado na tela, fora de contagem.
  const [assentado, setAssentado] = useState(valor);
  const [contado, setContado] = useState(null);
  // O número passou pelo esqueleto desde a última vez que assentou.
  const [escondido, setEscondido] = useState(esqueleto);
  // Valor na tela no meio de uma contagem, para a próxima sair dali.
  const mostradoRef = useRef(null);
  const elementoRef = useRef(null);

  // O esqueleto cobre o número: a contagem em andamento para e, quando ele
  // sair, a próxima começa do zero.
  if (esqueleto && !escondido) {
    setEscondido(true);
    setContado(null);
  }
  // O esqueleto saiu sem o dado novo (folha aberta, cache que chegou
  // depois): o número aparece no valor de agora, sem contar.
  if (escondido && !esqueleto && segurar) {
    setEscondido(false);
    setAssentado(valor);
  }

  useEffect(() => {
    if (esqueleto) {
      mostradoRef.current = null;
      return undefined;
    }
    if (segurar) return undefined;
    if (valor === assentado && !escondido && mostradoRef.current === null) return undefined;
    const plano = planoDaContagem({
      de: mostradoRef.current ?? assentado,
      para: valor,
      escondido,
      duracao: prefereMovimentoReduzido() ? 0 : lerDuracao('contar'),
    });
    let inicio = null;
    let quadro = requestAnimationFrame(function passo(agora) {
      inicio ??= agora;
      const progresso = plano.duracao > 0 ? (agora - inicio) / plano.duracao : 1;
      if (progresso < 1) {
        mostradoRef.current = valorDaContagem(plano.de, valor, progresso);
        setContado(mostradoRef.current);
        quadro = requestAnimationFrame(passo);
        return;
      }
      mostradoRef.current = null;
      setContado(null);
      setEscondido(false);
      setAssentado(valor);
      if (plano.pulsa) pulsar(elementoRef.current);
    });
    return () => cancelAnimationFrame(quadro);
  }, [assentado, escondido, esqueleto, segurar, valor]);

  let mostrado = assentado;
  if (contado !== null) mostrado = contado;
  // Saiu do esqueleto e a contagem ainda não deu o primeiro quadro.
  else if (escondido && !esqueleto) mostrado = 0;
  return [mostrado, elementoRef];
}
