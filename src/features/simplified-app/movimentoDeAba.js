import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { resolvePath, useLocation, useNavigate } from 'react-router-dom';
import {
  animar,
  entrarEmSequencia,
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
const TELAS_ABERTAS_POR_CIMA = [
  SIMPLIFIED_ROUTES.UNI,
  SIMPLIFIED_ROUTES.RELATORIO,
  SIMPLIFIED_ROUTES.ORGANIZAR,
];

function telaPorCima(pathname) {
  return TELAS_ABERTAS_POR_CIMA.find((path) => pathname === path || pathname.startsWith(`${path}/`)) ?? null;
}

function estaDentro(pathname, base) {
  return pathname.startsWith(`${base}/`);
}

// Transição de uma navegação pela hierarquia das rotas: a tela-filha abre,
// a tela-pai volta e a raiz de outra aba troca de aba. Telas lado a lado
// (Histórico -> Suporte, abas de Configurações) trocam na hora.
export function movimentoDaNavegacao(de, para) {
  const abaDe = abaDaRota(de);
  const abaPara = abaDaRota(para);
  const telaDe = telaPorCima(de);
  const telaPara = telaPorCima(para);
  if ((!abaDe && !telaDe) || (!abaPara && !telaPara) || de === para) return null;
  const paraRaizDeAba = abaPara?.path === para;
  if (paraRaizDeAba && abaDe && abaDe.id !== abaPara.id) return 'aba';
  if (estaDentro(de, para)) return 'voltar';
  if (estaDentro(para, de)) return 'abrir';
  if (telaDe && paraRaizDeAba) return 'voltar';
  if (telaPara && telaPara !== telaDe) return 'abrir';
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
  entrarEmSequencia(tela.children, { inicio: INICIO_DA_SEQUENCIA_MS });
}

export function useMovimentoDeAba({ shellRef, mainContentRef }) {
  const location = useLocation();
  const navigate = useNavigate();
  const abaAnteriorRef = useRef(abaDaRota(location.pathname));
  const rotaMontadaRef = useRef(null);
  const transicaoRef = useRef(null);
  const aguardandoFotoRef = useRef(false);

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
  // da rota mudar, e o CSS de data-uf-transicao anima a troca. Toque que
  // chega antes da foto é ignorado (regra do épico #148): navegaria duas
  // vezes. Depois da foto, o navegador já não entrega toque à página.
  const transicionar = useCallback((tipo, sentido, navegarDeFato) => {
    const raiz = document.documentElement;
    raiz.dataset.ufTransicao = tipo;
    raiz.style.setProperty('--uf-aba-sentido', String(sentido));

    // Transição anterior ainda esperando a rota montar: libera a espera dela.
    rotaMontadaRef.current?.();

    aguardandoFotoRef.current = true;
    const transicao = document.startViewTransition(() => new Promise((resolver) => {
      aguardandoFotoRef.current = false;
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

  // navigate() com a transição que a rota pede. Recebe o navigate da tela
  // que chamou (useNavegar), para o destino resolver como antes. Só destino
  // absoluto é classificado; número e caminho relativo navegam direto.
  const navegar = useCallback((destino, opcoes, navigateDaTela = navigate) => {
    if (aguardandoFotoRef.current) return;
    const caminho = typeof destino === 'string' ? destino : destino?.pathname;
    const tipo = caminho?.startsWith('/') && typeof document.startViewTransition === 'function'
      ? movimentoDaNavegacao(location.pathname, resolvePath(destino).pathname)
      : null;
    if (!tipo) {
      navigateDaTela(destino, opcoes);
      return;
    }
    const sentido = tipo === 'aba'
      ? sentidoDaAba(abaDaRota(location.pathname).id, abaDaRota(resolvePath(destino).pathname).id)
      : 1;
    transicionar(tipo, sentido, () => navigateDaTela(destino, opcoes));
  }, [location.pathname, navigate, transicionar]);

  const irParaAba = useCallback((evento, item) => {
    if (
      evento.defaultPrevented
      || evento.button !== 0
      || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey
      || typeof document.startViewTransition !== 'function'
      || !movimentoDaNavegacao(location.pathname, item.path)
    ) return;
    evento.preventDefault();
    navegar(item.path);
  }, [location.pathname, navegar]);

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
