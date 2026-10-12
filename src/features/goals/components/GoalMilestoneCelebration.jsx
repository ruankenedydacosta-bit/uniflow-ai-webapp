import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import OutlineButton from '../../../components/ui/OutlineButton';
import { lerDuracao, lerMola, prefereMovimentoReduzido, valorDaContagem } from '../../../utils/movimento.js';
import { tomDoMarco } from '../marcoDaMeta.js';
import { entrarNaCelebracao, estourarMarco, sairDaCelebracao } from '../movimentoDaCelebracao.js';
import { AnelDeProgresso } from './GoalListCard';
import styles from './GoalMilestoneCelebration.module.css';

// Tela de celebração do marco de meta (#147, 23b Salto). O cartão salta, o
// anel enche de 0 ao marco e, no fim, solta as faíscas. Com Reduzir
// movimento, o cartão só aparece, com o anel já no marco. Toques durante o
// salto do cartão são ignorados (épico #148); depois dele, fechar no meio da
// contagem corta as faíscas. `celebracao` vem de celebracaoDoMarco.
export default function GoalMilestoneCelebration({ celebracao, onClose }) {
  const { marco, titulo, texto } = celebracao;
  const tituloId = useId();
  const textoId = useId();
  const fundoRef = useRef(null);
  const cartaoRef = useRef(null);
  const anelRef = useRef(null);
  const botaoRef = useRef(null);
  const [reduzido] = useState(() => prefereMovimentoReduzido());
  const [progresso, setProgresso] = useState(() => (reduzido ? marco : 0));
  const ocupadoRef = useRef(!reduzido);
  const fechandoRef = useRef(false);

  useLayoutEffect(() => {
    entrarNaCelebracao({ fundo: fundoRef.current, cartao: cartaoRef.current });
  }, []);

  useEffect(() => {
    botaoRef.current?.focus({ preventScroll: true });
    if (reduzido) return undefined;
    const fimDoSalto = window.setTimeout(() => {
      if (!fechandoRef.current) ocupadoRef.current = false;
    }, lerMola('salto').duracao);
    // O anel começa a encher depois que o cartão já apareceu. O estado só
    // muda quando o número inteiro na tela muda.
    const duracao = lerDuracao('contar');
    let quadro = null;
    const espera = window.setTimeout(() => {
      let inicio = null;
      quadro = requestAnimationFrame(function passo(agora) {
        if (fechandoRef.current) return;
        inicio ??= agora;
        const andado = duracao > 0 ? (agora - inicio) / duracao : 1;
        if (andado < 1) {
          setProgresso(Math.round(valorDaContagem(0, marco, andado)));
          quadro = requestAnimationFrame(passo);
          return;
        }
        setProgresso(marco);
        estourarMarco(anelRef.current, marco);
      });
    }, lerDuracao('tela'));
    return () => {
      window.clearTimeout(fimDoSalto);
      window.clearTimeout(espera);
      if (quadro !== null) cancelAnimationFrame(quadro);
    };
  }, [marco, reduzido]);

  const fechar = useCallback(async () => {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    fechandoRef.current = true;
    await sairDaCelebracao({ fundo: fundoRef.current, cartao: cartaoRef.current });
    onClose();
  }, [onClose]);

  useEffect(() => {
    // Continuar é o único botão: Tab não sai do cartão para a tela de trás.
    function aoTeclar(event) {
      if (event.key === 'Escape') fechar();
      if (event.key === 'Tab') {
        event.preventDefault();
        botaoRef.current?.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [fechar]);

  useEffect(() => {
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflowAnterior;
    };
  }, []);

  return createPortal(
    <div className={styles.overlay}>
      <div ref={fundoRef} className={styles.fundo} onClick={fechar} aria-hidden="true" />
      <div
        ref={cartaoRef}
        className={styles.cartao}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={textoId}
      >
        {/* O título já diz o marco: o número que conta não é lido. */}
        <span ref={anelRef} className={styles.anel} aria-hidden="true">
          <AnelDeProgresso progresso={progresso} tom={tomDoMarco(marco)} className={styles.ring} />
        </span>
        <h2 id={tituloId} className={styles.titulo}>{titulo}</h2>
        <p id={textoId} className={styles.texto}>{texto}</p>
        <div className={styles.acoes}>
          <OutlineButton ref={botaoRef} onClick={fechar}>Continuar</OutlineButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
