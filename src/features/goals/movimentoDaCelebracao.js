import {
  acenderAnel,
  animar,
  centroDe,
  lerCurva,
  lerDuracao,
  lerMola,
  prefereMovimentoReduzido,
  soltarFaiscas,
} from '../../utils/movimento.js';
import { pulsar } from '../simplified-app/movimentoDeSalvar.js';

// Tela de celebração do marco de meta, direção 23b Salto (#147). Os tempos
// e as molas vêm dos tokens --uf-motion-*; quantidade e força das faíscas
// são as do protótipo.

export const FAISCAS_DO_MARCO = Object.freeze({
  50: { quantidade: 26, forca: 1 },
  100: { quantidade: 40, forca: 1.4 },
});

// Mesmo tamanho do anel na tela: o halo nasce na borda dele.
const ANEL_DO_MARCO_PX = 132;

export function corDoMarco(marco) {
  return marco === 100 ? 'var(--uf-app-brand-green-text)' : 'var(--uf-app-brand-violet-text)';
}

// O fundo escurece e o cartão salta de 72% com a mola salto. Com Reduzir
// movimento, os dois só aparecem num fade curto.
export function entrarNaCelebracao({ fundo, cartao }) {
  if (prefereMovimentoReduzido()) {
    const duracao = lerDuracao('reduzido');
    animar(fundo, [{ opacity: 0 }, { opacity: 1 }], { duracao });
    animar(cartao, [{ opacity: 0 }, { opacity: 1 }], { duracao });
    return;
  }
  animar(fundo, [{ opacity: 0 }, { opacity: 1 }], { duracao: lerDuracao('fundo'), curva: lerCurva('saida') });
  const salto = lerMola('salto');
  animar(cartao, [{ scale: '.72' }, { scale: '1' }], { duracao: salto.duracao, curva: salto.curva });
  animar(cartao, [{ opacity: 0 }, { opacity: 1 }], { duracao: lerDuracao('entrada'), curva: lerCurva('saida') });
}

// Quando o anel termina de encher: ele pulsa, acende o halo e solta as
// faíscas do marco. Só é chamado depois de o aporte ter dado certo.
export function estourarMarco(anel, marco) {
  if (!anel || prefereMovimentoReduzido()) return;
  const { quantidade, forca } = FAISCAS_DO_MARCO[marco] ?? FAISCAS_DO_MARCO[50];
  pulsar(anel);
  const { x, y } = centroDe(anel);
  acenderAnel({ x, y, tamanho: ANEL_DO_MARCO_PX, cor: corDoMarco(marco) });
  soltarFaiscas({ x, y, quantidade, forca });
}

// O cartão encolhe um pouco e some junto com o fundo.
export async function sairDaCelebracao({ fundo, cartao }) {
  const reduzido = prefereMovimentoReduzido();
  const duracao = lerDuracao(reduzido ? 'reduzido' : 'saida');
  const curva = lerCurva('acelera');
  const quadrosDoCartao = reduzido
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '.92' }];
  animar(cartao, quadrosDoCartao, { duracao, curva, preencher: 'forwards' });
  const animacao = animar(fundo, [{ opacity: 1 }, { opacity: 0 }], { duracao, curva, preencher: 'forwards' });
  await animacao?.finished.catch(() => {});
}
