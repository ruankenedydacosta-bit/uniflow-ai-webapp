import {
  acenderAnel,
  animar,
  centroDe,
  ehFolha,
  esperar,
  lerCurva,
  lerDuracao,
  lerMola,
  prefereMovimentoReduzido,
  soltarFaiscas,
} from '../../utils/movimento.js';

// Folha e salvar movimentação, direção 23b Salto (#145). Os tempos e as
// molas vêm dos tokens --uf-motion-*; os atrasos curtos abaixo são os do
// protótipo.

// Tempo que o check fica à vista antes de a folha descer.
const CHECK_A_VISTA_MS = 520;
const CHECK_A_VISTA_REDUZIDO_MS = 360;
const ATRASO_DO_CHECK_MS = 80;
const ATRASO_DA_LINHA_MS = 60;
const ATRASO_DO_BRILHO_MS = 250;
const FAISCAS_AO_SALVAR = 12;
const FORCA_AO_SALVAR = 0.7;
const ANEL_AO_SALVAR_PX = 44;

// O botão estala, o rótulo sai para cima e o check pula, com anel e
// faíscas. Resolve quando a folha já pode descer. Só é chamado depois de o
// salvamento dar certo: erro não tem faísca.
export async function celebrarSalvar(botao) {
  if (!botao) return;
  const rotulo = botao.querySelector('[data-salvar-rotulo]');
  const check = botao.querySelector('[data-salvar-check]');

  if (prefereMovimentoReduzido()) {
    const duracao = lerDuracao('reduzido');
    animar(rotulo, [{ opacity: 1 }, { opacity: 0 }], { duracao, preencher: 'forwards' });
    animar(check, [{ opacity: 0 }, { opacity: 1 }], { duracao, preencher: 'forwards' });
    await esperar(CHECK_A_VISTA_REDUZIDO_MS);
    return;
  }

  animar(rotulo, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -10px' }], {
    duracao: lerDuracao('saida'),
    curva: lerCurva('acelera'),
    preencher: 'forwards',
  });
  const salto = lerMola('salto');
  animar(check, [{ opacity: 0, scale: '0' }, { opacity: 1, scale: '1' }], {
    duracao: salto.duracao,
    curva: salto.curva,
    atraso: ATRASO_DO_CHECK_MS,
    preencher: 'both',
  });
  const estalo = lerMola('estalo');
  animar(botao, [{ scale: '.92' }], { duracao: estalo.duracao, curva: estalo.curva });

  const { x, y } = centroDe(botao);
  acenderAnel({ x, y, tamanho: ANEL_AO_SALVAR_PX, cor: 'var(--uf-app-success)' });
  soltarFaiscas({ x, y, quantidade: FAISCAS_AO_SALVAR, forca: FORCA_AO_SALVAR });
  await esperar(CHECK_A_VISTA_MS);
}

// A folha desce e o fundo clareia. Diálogo no centro da tela (desktop) e
// Reduzir movimento só somem.
export async function fecharFolha(dialogo) {
  const fundo = dialogo?.parentElement;
  if (!fundo) return;
  const reduzido = prefereMovimentoReduzido();
  const desce = !reduzido && ehFolha(dialogo);
  const duracao = lerDuracao(reduzido ? 'reduzido' : 'tela');
  const curva = lerCurva('acelera');
  if (desce) {
    animar(dialogo, [{ translate: '0 0' }, { translate: '0 100%' }], { duracao, curva, preencher: 'forwards' });
  }
  const animacao = animar(fundo, [{ opacity: 1 }, { opacity: 0 }], { duracao, curva, preencher: 'forwards' });
  await animacao?.finished.catch(() => {});
}

// Linha nova: abre, entra pela esquerda e brilha. O brilho é uma camada
// por cima da linha que só perde opacidade.
export function animarLinhaNova(linha) {
  if (!linha || prefereMovimentoReduzido()) return;
  const altura = linha.offsetHeight;
  animar(linha, [{ height: '0px', opacity: 0 }, { height: `${altura}px`, opacity: 1 }], {
    duracao: lerDuracao('linha'),
    curva: lerCurva('saida'),
  });
  const macio = lerMola('macio');
  animar(linha.firstElementChild, [{ translate: '-28px 0' }], {
    duracao: macio.duracao,
    curva: macio.curva,
    atraso: ATRASO_DA_LINHA_MS,
  });

  const brilho = document.createElement('span');
  brilho.setAttribute('aria-hidden', 'true');
  Object.assign(brilho.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '2',
    borderRadius: 'inherit',
    background: 'color-mix(in oklch, var(--uf-app-brand-violet) 18%, transparent)',
    pointerEvents: 'none',
  });
  linha.appendChild(brilho);
  const apagar = animar(brilho, [{ opacity: 1 }, { opacity: 0 }], {
    duracao: lerDuracao('brilho'),
    curva: lerCurva('saida'),
    atraso: ATRASO_DO_BRILHO_MS,
    preencher: 'both',
  });
  if (!apagar) {
    brilho.remove();
    return;
  }
  apagar.finished.catch(() => {}).finally(() => brilho.remove());
}

// Número que mudou dá um pulo e volta com a mola estalo.
export function pulsar(elemento) {
  if (!elemento || prefereMovimentoReduzido()) return;
  const estalo = lerMola('estalo');
  animar(elemento, [{ scale: '1.08' }], { duracao: estalo.duracao, curva: estalo.curva });
}
