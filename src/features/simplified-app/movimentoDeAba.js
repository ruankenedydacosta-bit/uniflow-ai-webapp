import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { resolvePath, useLocation, useNavigate } from 'react-router-dom';
import {
  animar,
  atrasosDaSequencia,
  lerCurva,
  lerDuracao,
  lerMola,
  prefereMovimentoReduzido,
} from '../../utils/movimento.js';
import { SIMPLIFIED_NAVIGATION, SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';

// Troca de aba e toque da direção 23b Salto (#143), abrir e voltar de tela
// (#144). A tela que sai e a que entra são animadas pela View Transitions API
// (CSS em simplifiedApp.module.css); o ícone da aba e os blocos da tela nova,
// por WAAPI com translate/scale individuais, que se somam ao transform que o
// bloco já tenha.

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
// Tempo máximo que a transição espera a tela nova montar. Rota que demora
// mais (Hoje é lazy e pode não ter baixado) troca sem a transição, para não
// congelar a tela nem animar a tela antiga entrando de novo.
const ESPERA_MAXIMA_DA_ROTA_MS = 300;

export function abaDaRota(pathname) {
  return ABAS.find((aba) => pathname === aba.path || pathname.startsWith(`${aba.path}/`)) ?? null;
}

// Telas fora da barra que abrem por cima de uma aba (pelo Mais ou pela Home).
const TELAS_ABERTAS_POR_CIMA = [SIMPLIFIED_ROUTES.UNI, SIMPLIFIED_ROUTES.RELATORIO];

function segmentosDepois(pathname, base) {
  return pathname.slice(base.length).split('/').filter(Boolean).length;
}

// Nível da tela na pilha: raiz de aba é 0 e cada segmento a mais abre uma
// tela por cima (/app/conta/pagamentos/historico é 2). Rota fora do app: null.
export function profundidadeDaRota(pathname) {
  const aba = abaDaRota(pathname);
  if (aba) return segmentosDepois(pathname, aba.path);
  const tela = TELAS_ABERTAS_POR_CIMA.find((path) => pathname === path || pathname.startsWith(`${path}/`));
  return tela ? 1 + segmentosDepois(pathname, tela) : null;
}

// Transição de uma navegação comum: tela mais funda abre, mais rasa volta,
// raiz de outra aba troca de aba. Entre telas do mesmo nível (abas de
// Configurações, por exemplo) a troca é na hora.
export function movimentoDaNavegacao(de, para) {
  const nivelDe = profundidadeDaRota(de);
  const nivelPara = profundidadeDaRota(para);
  if (nivelDe === null || nivelPara === null) return null;
  if (nivelPara > nivelDe) return 'abrir';
  if (nivelPara < nivelDe) return 'voltar';
  if (nivelPara === 0 && abaDaRota(de).id !== abaDaRota(para).id) return 'aba';
  return null;
}

// 1 quando a aba nova fica à direita da antiga na barra, -1 à esquerda.
export function sentidoDaAba(idDe, idPara) {
  const ordem = SIMPLIFIED_NAVIGATION.map((item) => item.id);
  return Math.sign(ordem.indexOf(idPara) - ordem.indexOf(idDe)) || 1;
}

function animarIconeDaAba(raiz) {
  const icone = raiz?.querySelector('nav [aria-current="page"] [data-movimento-icone]');
  const mola = lerMola('salto');
  animar(icone, [{ scale: '.55', translate: '0 4px' }], { duracao: mola.duracao, curva: mola.curva });
}

function animarBlocosDaTela(conteudo) {
  const tela = conteudo?.querySelector(SELETOR_DA_TELA_DE_ABA);
  if (!tela) return;
  // Bloco sem altura (título só para leitor de tela) não ocupa lugar na fila.
  const blocos = [...tela.children].filter((bloco) => bloco.offsetHeight > 1);
  const mola = lerMola('macio');
  const duracaoDaOpacidade = lerDuracao('entrada');
  const curvaDaOpacidade = lerCurva('saida');
  const atrasos = atrasosDaSequencia(blocos.length, {
    inicio: INICIO_DA_SEQUENCIA_MS,
    intervalo: lerDuracao('sequencia'),
  });
  // Só o quadro inicial: cada bloco termina na opacidade e escala que o
  // CSS dele já define (card esmaecido continua esmaecido).
  atrasos.forEach((atraso, indice) => {
    animar(blocos[indice], [{ translate: '0 20px', scale: '.98' }], {
      duracao: mola.duracao,
      curva: mola.curva,
      atraso,
    });
    animar(blocos[indice], [{ opacity: 0 }], {
      duracao: duracaoDaOpacidade,
      curva: curvaDaOpacidade,
      atraso,
    });
  });
}

export function useMovimentoDeAba({ shellRef, mainContentRef }) {
  const location = useLocation();
  const navigate = useNavigate();
  const abaAnteriorRef = useRef(abaDaRota(location.pathname));
  const rotaMontadaRef = useRef(null);
  const transicaoRef = useRef(null);

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

  // Navega dentro de uma View Transition: a tela antiga é fotografada antes
  // da rota mudar, e o CSS de data-uf-transicao anima a troca.
  const transicionar = useCallback((tipo, sentido, navegarDeFato) => {
    const raiz = document.documentElement;
    raiz.dataset.ufTransicao = tipo;
    raiz.style.setProperty('--uf-aba-sentido', String(sentido));

    // Toque em outra tela antes da anterior montar: libera a espera dela.
    rotaMontadaRef.current?.();

    const transicao = document.startViewTransition(() => new Promise((resolver) => {
      rotaMontadaRef.current = resolver;
      navegarDeFato();
      window.setTimeout(() => {
        if (rotaMontadaRef.current !== resolver) return;
        rotaMontadaRef.current = null;
        transicao.skipTransition();
        resolver();
      }, ESPERA_MAXIMA_DA_ROTA_MS);
    }));
    transicaoRef.current = transicao;
    transicao.ready.catch(() => {});
    transicao.finished.catch(() => {}).finally(() => {
      // Uma transição pulada por outra não apaga o estado da que a substituiu.
      if (transicaoRef.current !== transicao) return;
      transicaoRef.current = null;
      delete raiz.dataset.ufTransicao;
      raiz.style.removeProperty('--uf-aba-sentido');
    });
  }, []);

  const irParaAba = useCallback((evento, item) => {
    if (
      evento.defaultPrevented
      || evento.button !== 0
      || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey
      || typeof document.startViewTransition !== 'function'
    ) return;

    const abaAtual = abaDaRota(location.pathname);
    if (!abaAtual) return;
    // A própria aba, vista de uma tela aberta nela (Plano -> Mais), volta.
    if (abaAtual.id === item.id) {
      if (!profundidadeDaRota(location.pathname)) return;
      evento.preventDefault();
      transicionar('voltar', 1, () => navigate(item.path));
      return;
    }
    evento.preventDefault();
    transicionar('aba', sentidoDaAba(abaAtual.id, item.id), () => navigate(item.path));
  }, [location.pathname, navigate, transicionar]);

  // navigate() com a transição que a rota pede. Fica estável entre rotas
  // (lê a rota atual por ref) para não reexecutar efeitos que dependem dele.
  const rotaAtualRef = useRef(location.pathname);
  useLayoutEffect(() => {
    rotaAtualRef.current = location.pathname;
  }, [location.pathname]);

  const navegar = useCallback((destino, opcoes) => {
    if (typeof destino === 'number' || typeof document.startViewTransition !== 'function') {
      navigate(destino, opcoes);
      return;
    }
    const de = rotaAtualRef.current;
    const para = resolvePath(destino, de).pathname;
    const tipo = movimentoDaNavegacao(de, para);
    if (!tipo) {
      navigate(destino, opcoes);
      return;
    }
    const sentido = tipo === 'aba' ? sentidoDaAba(abaDaRota(de).id, abaDaRota(para).id) : 1;
    transicionar(tipo, sentido, () => navigate(destino, opcoes));
  }, [navigate, transicionar]);

  return { irParaAba, navegar };
}

// Escala que o CSS já dá ao elemento. Escala diferente por eixo fica sem
// toque, para não deformar.
function escalaDoCss(elemento) {
  const valor = getComputedStyle(elemento).scale;
  if (!valor || valor === 'none') return 1;
  const [x, y = x] = valor.split(' ').map(Number);
  return x === y && Number.isFinite(x) ? x : null;
}

// Toque: o que é tocável vai a 95% e volta com a mola estalo. Um ouvinte
// só, no documento, cobre também modais abertos fora do shell. Áreas que
// ocupam meia tela ou mais (tela de voz, fundo de modal) não encolhem.
// A volta tem só o quadro inicial: termina na escala que o CSS der na hora.
export function useToqueComMola() {
  useEffect(() => {
    let pressionado = null;
    let descida = null;

    function soltar() {
      const elemento = pressionado;
      if (!elemento) return;
      pressionado = null;
      const escalaAtual = getComputedStyle(elemento).scale;
      descida?.cancel();
      descida = null;
      const mola = lerMola('estalo');
      animar(elemento, [{ scale: escalaAtual }], {
        duracao: mola.duracao,
        curva: mola.curva,
      });
    }

    function pressionar(evento) {
      if (evento.button !== 0 || prefereMovimentoReduzido()) return;
      const elemento = evento.target.closest?.(SELETOR_DO_TOQUE);
      if (!elemento || elemento.offsetHeight >= window.innerHeight / 2) return;
      soltar();
      const escala = escalaDoCss(elemento);
      if (escala === null) return;
      pressionado = elemento;
      descida = animar(elemento, [{ scale: String(escala) }, { scale: String(escala * 0.95) }], {
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
