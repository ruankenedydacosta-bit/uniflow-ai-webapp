// Movimento do app (épico #148). Os valores vêm dos tokens --uf-motion-*
// de theme.css; este módulo só os lê e aplica com a Web Animations API.

const PREFIXO_DO_TOKEN = '--uf-motion-';

export function prefereMovimentoReduzido(janela = globalThis.window) {
  return Boolean(janela?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// "120ms" -> 120. Valor ausente ou inválido vira 0.
export function lerMilissegundos(valor) {
  const numero = Number.parseFloat(valor);
  return Number.isFinite(numero) ? numero : 0;
}

export function lerTokenDeMovimento(nome, raiz = globalThis.document?.documentElement) {
  if (!raiz || typeof getComputedStyle !== 'function') return '';
  return getComputedStyle(raiz).getPropertyValue(`${PREFIXO_DO_TOKEN}${nome}`).trim();
}

export function lerDuracao(nome) {
  return lerMilissegundos(lerTokenDeMovimento(nome));
}

// Mola = curva linear() + o tempo até assentar, sempre lidos juntos.
export function lerMola(nome) {
  return {
    curva: lerTokenDeMovimento(`mola-${nome}`),
    duracao: lerDuracao(`mola-${nome}-duracao`),
  };
}

export function lerCurva(nome) {
  return lerTokenDeMovimento(`curva-${nome}`);
}

// Navegador sem linear() recusa a curva com TypeError: cai na curva de
// saída, sem rebote, em vez de perder a animação.
export function animar(elemento, quadros, { duracao, curva, atraso = 0, preencher = 'backwards' }) {
  if (!elemento?.animate || duracao <= 0) return null;
  const opcoes = { duration: duracao, delay: atraso, fill: preencher };
  try {
    return elemento.animate(quadros, { ...opcoes, easing: curva || 'linear' });
  } catch {
    return elemento.animate(quadros, { ...opcoes, easing: lerCurva('saida') || 'ease-out' });
  }
}

// Sequência de entrada: até 8 blocos visíveis, cada um com o seu atraso.
export const LIMITE_DA_SEQUENCIA = 8;

export function atrasosDaSequencia(quantidade, { inicio, intervalo, limite = LIMITE_DA_SEQUENCIA }) {
  return Array.from({ length: Math.min(quantidade, limite) }, (_, indice) => inicio + indice * intervalo);
}

// Os blocos sobem 20px e aparecem um depois do outro, com a mola macio.
// Só o quadro inicial: cada bloco termina na opacidade e escala que o CSS
// dele já define (card esmaecido continua esmaecido). Bloco sem altura
// (título só para leitor de tela) não ocupa lugar na fila. Com Reduzir
// movimento, todos aparecem juntos num fade curto.
export function entrarEmSequencia(elementos, { inicio = 0 } = {}) {
  const blocos = [...elementos].filter((bloco) => bloco.offsetHeight > 1);
  if (prefereMovimentoReduzido()) {
    const duracao = lerDuracao('reduzido');
    blocos.forEach((bloco) => animar(bloco, [{ opacity: 0 }], { duracao }));
    return;
  }
  const mola = lerMola('macio');
  const duracaoDaOpacidade = lerDuracao('entrada');
  const curvaDaOpacidade = lerCurva('saida');
  const atrasos = atrasosDaSequencia(blocos.length, { inicio, intervalo: lerDuracao('sequencia') });
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

// Contagem de número: anda rápido no começo e assenta no valor final
// (ease-out cúbica, como no protótipo do Salto).
export function valorDaContagem(de, para, progresso) {
  const andado = Math.min(1, Math.max(0, progresso));
  return de + (para - de) * (1 - (1 - andado) ** 3);
}

// De onde a contagem sai, quanto dura e se o número pulsa no fim. Número
// que estava escondido pelo esqueleto conta a partir de zero e não pulsa:
// ele está entrando, não mudando. Valor que não é número troca direto.
export function planoDaContagem({ de, para, escondido, duracao }) {
  const inicio = escondido ? 0 : de;
  if (!Number.isFinite(inicio) || !Number.isFinite(para) || inicio === para) {
    return { de: para, duracao: 0, pulsa: false };
  }
  return { de: inicio, duracao, pulsa: !escondido && duracao > 0 };
}

// Folha é o diálogo encostado no pé da tela. No desktop o Modal é um
// diálogo no centro: abre sem sequência e fecha só sumindo.
export function ehFolha(dialogo) {
  return dialogo.getBoundingClientRect().bottom >= window.innerHeight - 1;
}

export function centroDe(elemento) {
  const caixa = elemento.getBoundingClientRect();
  return { x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height / 2 };
}

// Cores das faíscas, na ordem em que se alternam.
const CORES_DAS_FAISCAS = [
  'var(--uf-app-brand-blue)',
  'var(--uf-app-brand-violet)',
  'var(--uf-app-brand-green)',
  'var(--uf-app-brand-violet-text)',
];

// Para onde cada faísca voa: espalhadas em volta do ponto, com um pouco de
// acaso no ângulo, na distância, no giro e no tempo de voo. `forca` escala
// a distância (0,7 ao salvar, 1 ou mais nos marcos de meta).
export function trajetoriasDasFaiscas(quantidade, forca, { voo, aleatorio = Math.random }) {
  return Array.from({ length: quantidade }, (_, indice) => {
    const angulo = (indice / quantidade) * Math.PI * 2 + aleatorio() * 0.5;
    const distancia = (70 + aleatorio() * 80) * forca;
    return {
      dx: Math.cos(angulo) * distancia,
      dy: Math.sin(angulo) * distancia,
      giro: Math.round(aleatorio() * 540 - 270),
      duracao: voo + aleatorio() * 400,
      ponto: aleatorio() < 0.45,
      cor: CORES_DAS_FAISCAS[indice % CORES_DAS_FAISCAS.length],
    };
  });
}

// Camada fixa por cima de tudo, que some quando a última animação acaba.
function camadaDeEfeito(animacoesDe) {
  const camada = document.createElement('div');
  Object.assign(camada.style, {
    position: 'fixed',
    inset: '0',
    zIndex: 'var(--uf-z-toast)',
    overflow: 'hidden',
    pointerEvents: 'none',
  });
  camada.setAttribute('aria-hidden', 'true');
  document.body.appendChild(camada);
  const animacoes = animacoesDe(camada).filter(Boolean);
  Promise.allSettled(animacoes.map((animacao) => animacao.finished)).then(() => camada.remove());
  if (!animacoes.length) camada.remove();
}

// Faíscas: só ao salvar e nos marcos de meta, nunca em erro (épico #148).
export function soltarFaiscas({ x, y, quantidade, forca }) {
  if (prefereMovimentoReduzido()) return;
  const voo = lerDuracao('faisca');
  const curva = lerCurva('faisca');
  camadaDeEfeito((camada) => trajetoriasDasFaiscas(quantidade, forca, { voo }).map((faisca) => {
    const largura = faisca.ponto ? 6 : 4;
    const altura = faisca.ponto ? 6 : 10;
    const elemento = document.createElement('span');
    Object.assign(elemento.style, {
      position: 'absolute',
      left: `${x - largura / 2}px`,
      top: `${y - altura / 2}px`,
      width: `${largura}px`,
      height: `${altura}px`,
      borderRadius: faisca.ponto ? '50%' : '2px',
      background: faisca.cor,
      boxShadow: `0 0 6px ${faisca.cor}`,
    });
    camada.appendChild(elemento);
    return animar(elemento, [
      { transform: 'translate(0, 0) rotate(0deg) scale(.4)', opacity: 1 },
      {
        transform: `translate(${faisca.dx * 0.85}px, ${faisca.dy * 0.85 - 10}px) rotate(${faisca.giro / 2}deg) scale(1)`,
        opacity: 1,
        offset: 0.45,
      },
      { transform: `translate(${faisca.dx}px, ${faisca.dy + 60}px) rotate(${faisca.giro}deg) scale(.6)`, opacity: 0 },
    ], { duracao: faisca.duracao, curva, preencher: 'forwards' });
  }));
}

// Anel que se expande e se apaga em volta do ponto.
export function acenderAnel({ x, y, tamanho, cor }) {
  if (prefereMovimentoReduzido()) return;
  camadaDeEfeito((camada) => {
    const anel = document.createElement('span');
    Object.assign(anel.style, {
      position: 'absolute',
      left: `${x - tamanho / 2}px`,
      top: `${y - tamanho / 2}px`,
      width: `${tamanho}px`,
      height: `${tamanho}px`,
      borderRadius: '50%',
      boxShadow: `inset 0 0 0 2px ${cor}, 0 0 16px ${cor}`,
    });
    camada.appendChild(anel);
    return [animar(anel, [
      { transform: 'scale(1)', opacity: 0.9 },
      { transform: 'scale(2.2)', opacity: 0 },
    ], { duracao: lerDuracao('anel'), curva: lerCurva('saida'), preencher: 'forwards' })];
  });
}

export function esperar(milissegundos) {
  return new Promise((resolver) => { setTimeout(resolver, milissegundos); });
}
