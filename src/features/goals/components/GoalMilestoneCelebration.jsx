import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import OutlineButton from '../../../components/ui/OutlineButton';
import { lerDuracao, prefereMovimentoReduzido, valorDaContagem } from '../../../utils/movimento.js';
import { entrarNaCelebracao, estourarMarco, sairDaCelebracao } from '../movimentoDaCelebracao.js';
import { AnelDeProgresso } from './GoalListCard';
import styles from './GoalMilestoneCelebration.module.css';

// Tela de celebração do marco de meta (#147, 23b Salto). O cartão salta, o
// anel enche de 0 ao marco e, no fim, solta as faíscas. Com Reduzir
// movimento, o cartão só aparece, com o anel já no marco. Toques durante a
// entrada são ignorados (épico #148). `celebracao` vem de celebracaoDoMarco.
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

  useLayoutEffect(() => {
    entrarNaCelebracao({ fundo: fundoRef.current, cartao: cartaoRef.current });
  }, []);

  useEffect(() => {
    botaoRef.current?.focus({ preventScroll: true });
    if (reduzido) return undefined;
    // O anel começa a encher depois que o cartão já apareceu.
    const duracao = lerDuracao('contar');
    let quadro = null;
    const espera = window.setTimeout(() => {
      let inicio = null;
      quadro = requestAnimationFrame(function passo(agora) {
        inicio ??= agora;
        const andado = duracao > 0 ? (agora - inicio) / duracao : 1;
        if (andado < 1) {
          setProgresso(valorDaContagem(0, marco, andado));
          quadro = requestAnimationFrame(passo);
          return;
        }
        setProgresso(marco);
        ocupadoRef.current = false;
        estourarMarco(anelRef.current, marco);
      });
    }, lerDuracao('tela'));
    return () => {
      window.clearTimeout(espera);
      if (quadro !== null) cancelAnimationFrame(quadro);
    };
  }, [marco, reduzido]);

  const fechar = useCallback(async () => {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    await sairDaCelebracao({ fundo: fundoRef.current, cartao: cartaoRef.current });
    onClose();
  }, [onClose]);

  useEffect(() => {
    function aoTeclar(event) {
      if (event.key === 'Escape') fechar();
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
        <span ref={anelRef} className={styles.anel}>
          <AnelDeProgresso
            progresso={Math.round(progresso)}
            tom={marco === 100 ? 'verde' : 'violeta'}
            className={styles.ring}
          />
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
