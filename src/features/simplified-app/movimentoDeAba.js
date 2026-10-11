import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  animar,
  atrasosDaSequencia,
  lerCurva,
  lerDuracao,
  lerMola,
  prefereMovimentoReduzido,
} from '../../utils/movimento.js';
import { SIMPLIFIED_NAVIGATION } from './simplifiedRoutes.js';

// Troca de aba e toque da direção 23b Salto (#143). A tela que sai e a que
// entra são animadas pela View Transitions API (CSS em simplifiedApp.module.css);
// o ícone da aba e os blocos da tela nova, por WAAPI com translate/scale
// individuais, que se somam ao transform que o bloco já tenha.

const ABAS = SIMPLIFIED_NAVIGATION.filter((item) => item.path);

// Raízes das telas de aba: os filhos diretos delas são os blocos da sequência.
const SELETOR_DA_TELA_DE_ABA = [
  '[data-simplified-home]',
  '[data-simplified-records]',
  '[data-simplified-agenda]',
  '[data-simplified-account]',
].join(', ');

const SELETOR_DO_TOQUE = 'button:not(:disabled), a[href], [role="button"]:not([aria-disabled="true"])';

// Atraso da sequência depois da troca de aba (protótipo do Salto).
const INICIO_DA_SEQUENCIA_MS = 90;
// Tempo máximo que a transição espera a tela nova montar antes de animar
// o que houver; evita congelar a tela se a rota demorar.
const ESPERA_MAXIMA_DA_ROTA_MS = 500;

export function abaDaRota(pathname) {
  return ABAS.find((aba) => pathname === aba.path || pathname.startsWith(`${aba.path}/`)) ?? null;
}

// 1 quando a aba nova fica à direita da antiga na barra, -1 à esquerda.
export function sentidoDaAba(idDe, idPara) {
  const ordem = SIMPLIFIED_NAVIGATION.map((item) => item.id);
  return Math.sign(ordem.indexOf(idPara) - ordem.indexOf(idDe)) || 1;
}

function animarIconeDaAba(raiz) {
  const icone = raiz?.querySelector('nav [aria-current="page"] [data-movimento-icone]');
  const mola = lerMola('salto');
  animar(icone, [
    { scale: '.55', translate: '0 4px' },
    { scale: '1', translate: '0 0' },
  ], { duracao: mola.duracao, curva: mola.curva });
}

function animarBlocosDaTela(conteudo) {
  const tela = conteudo?.querySelector(SELETOR_DA_TELA_DE_ABA);
  if (!tela) return;
  // Bloco sem altura (título só para leitor de tela) não ocupa lugar na fila.
  const blocos = [...tela.children].filter((bloco) => bloco.offsetHeight > 1);
  const mola = lerMola('macio');
  const atrasos = atrasosDaSequencia(blocos.length, {
    inicio: INICIO_DA_SEQUENCIA_MS,
    intervalo: lerDuracao('sequencia'),
  });
  atrasos.forEach((atraso, indice) => {
    animar(blocos[indice], [
      { translate: '0 20px', scale: '.98' },
      { translate: '0 0', scale: '1' },
    ], { duracao: mola.duracao, curva: mola.curva, atraso });
    animar(blocos[indice], [{ opacity: 0 }, { opacity: 1 }], {
      duracao: lerDuracao('entrada'),
      curva: lerCurva('saida'),
      atraso,
    });
  });
}

export function useMovimentoDeAba({ shellRef, mainContentRef }) {
  const location = useLocation();
  const navigate = useNavigate();
  const abaAnteriorRef = useRef(abaDaRota(location.pathname));
  const rotaMontadaRef = useRef(null);

  useLayoutEffect(() => {
    rotaMontadaRef.current?.();
    rotaMontadaRef.current = null;

    const abaAtual = abaDaRota(location.pathname);
    const abaAnterior = abaAnteriorRef.current;
    abaAnteriorRef.current = abaAtual;
    if (!abaAtual || !abaAnterior || abaAtual.id === abaAnterior.id) return;
    if (prefereMovimentoReduzido()) return;
    animarIconeDaAba(shellRef.current);
    animarBlocosDaTela(mainContentRef.current);
  }, [location.key, location.pathname, mainContentRef, shellRef]);

  const irParaAba = useCallback((evento, item) => {
    if (
      evento.defaultPrevented
      || evento.button !== 0
      || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey
      || typeof document.startViewTransition !== 'function'
    ) return;

    // Voltar à raiz da própria aba (Plano -> Mais) não é troca de aba.
    const abaAtual = abaDaRota(location.pathname);
    if (!abaAtual || abaAtual.id === item.id) return;
    evento.preventDefault();

    const raiz = document.documentElement;
    raiz.dataset.ufTransicao = 'aba';
    raiz.style.setProperty('--uf-aba-sentido', String(sentidoDaAba(abaAtual.id, item.id)));

    const transicao = document.startViewTransition(() => new Promise((resolver) => {
      rotaMontadaRef.current = resolver;
      navigate(item.path);
      window.setTimeout(resolver, ESPERA_MAXIMA_DA_ROTA_MS);
    }));
    transicao.ready.catch(() => {});
    transicao.finished.catch(() => {}).finally(() => {
      delete raiz.dataset.ufTransicao;
      raiz.style.removeProperty('--uf-aba-sentido');
    });
  }, [location.pathname, navigate]);

  return { irParaAba };
}

// Toque: o que é tocável vai a 95% e volta com a mola estalo. Um ouvinte
// só, no documento, cobre também modais abertos fora do shell. Áreas que
// ocupam meia tela ou mais (tela de voz, fundo de modal) não encolhem.
export function useToqueComMola() {
  useEffect(() => {
    let pressionado = null;
    let descida = null;

    function soltar() {
      const elemento = pressionado;
      if (!elemento) return;
      pressionado = null;
      const escalaAtual = Number.parseFloat(getComputedStyle(elemento).scale) || 1;
      descida?.cancel();
      descida = null;
      const mola = lerMola('estalo');
      animar(elemento, [{ scale: String(escalaAtual) }, { scale: '1' }], {
        duracao: mola.duracao,
        curva: mola.curva,
      });
    }

    function pressionar(evento) {
      if (evento.button !== 0 || prefereMovimentoReduzido()) return;
      const elemento = evento.target.closest?.(SELETOR_DO_TOQUE);
      if (!elemento || elemento.offsetHeight >= window.innerHeight / 2) return;
      soltar();
      pressionado = elemento;
      descida = animar(elemento, [{ scale: '1' }, { scale: '.95' }], {
        duracao: lerDuracao('toque'),
        curva: lerCurva('saida'),
        preencher: 'forwards',
      });
    }

    document.addEventListener('pointerdown', pressionar);
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', soltar);
    return () => {
      document.removeEventListener('pointerdown', pressionar);
      document.removeEventListener('pointerup', soltar);
      document.removeEventListener('pointercancel', soltar);
      descida?.cancel();
    };
  }, []);
}
