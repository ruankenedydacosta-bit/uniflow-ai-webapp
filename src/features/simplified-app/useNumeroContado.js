import { useEffect, useRef, useState } from 'react';
import { lerDuracao, prefereMovimentoReduzido, valorDaContagem } from '../../utils/movimento.js';
import { pulsar } from './movimentoDeSalvar.js';

// Número que conta e pulsa depois de salvar (#145). Enquanto `segurar` está
// ligado (a folha aberta), a tela continua mostrando o valor de quando ela
// abriu; quando a folha desce, o número conta até o valor novo e pulsa no
// elemento de `elementoRef`. Mudança fora da folha (carregar, trocar de mês)
// troca direto, inclusive no meio de uma contagem. Com Reduzir movimento,
// troca direto também.
export function useNumeroContado(valor, { segurar = false } = {}) {
  // Embrulhado para um valor nulo não se confundir com "nada retido".
  const [retido, setRetido] = useState(null);
  const [contado, setContado] = useState(null);
  // Contagem em andamento: de qual retenção ela saiu e o valor na tela.
  const contagemRef = useRef({ retido: null, mostrado: null });
  const elementoRef = useRef(null);

  if (segurar && retido === null) setRetido({ valor });

  useEffect(() => {
    const contagem = contagemRef.current;
    if (segurar) {
      // Folha aberta no meio de uma contagem: o número para onde estava e,
      // quando ela descer, conta dali.
      contagem.retido = null;
      return undefined;
    }
    if (retido === null) return undefined;
    const mudouNoMeio = contagem.retido === retido;
    const de = contagem.mostrado ?? retido.valor;
    const duracao = mudouNoMeio || de === valor || prefereMovimentoReduzido() ? 0 : lerDuracao('contar');
    contagem.retido = retido;
    let inicio = null;
    let quadro = requestAnimationFrame(function passo(agora) {
      inicio ??= agora;
      const progresso = duracao > 0 ? (agora - inicio) / duracao : 1;
      if (progresso < 1) {
        contagem.mostrado = valorDaContagem(de, valor, progresso);
        setContado(contagem.mostrado);
        quadro = requestAnimationFrame(passo);
        return;
      }
      contagem.retido = null;
      contagem.mostrado = null;
      setContado(null);
      setRetido(null);
      if (duracao > 0) pulsar(elementoRef.current);
    });
    return () => cancelAnimationFrame(quadro);
  }, [retido, segurar, valor]);

  let mostrado = valor;
  if (contado !== null) mostrado = contado;
  else if (retido !== null) mostrado = retido.valor;
  return [mostrado, elementoRef];
}
