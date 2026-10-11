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
