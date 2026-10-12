/* global process */
// Mede o uni-interpret lendo respostas a um rascunho em aberto (#80): com o
// card na tela ou um campo pendente, a frase vai com o rascunho, e o app só
// aplica o que correcaoDoRascunho devolve. avaliar-modelo.js não cobre esse
// caminho, porque a régua dele não leva rascunho.
//
// Uso (OpenAI, família gpt-5.6, temperatura padrão):
//   node --env-file=.env.eval.local scripts/uni-eval/avaliar-rascunho.js --modelo gpt-5.6-luna
// Chave: OPENAI_API_KEY, no ambiente ou em .env.eval.local (fora do git).

import { validarInterpretacao } from '../../supabase/functions/_shared/uniInterpret/contrato.js';
import { INSTRUCOES, montarMensagemUsuario } from '../../supabase/functions/_shared/uniInterpret/prompt.js';
import { interpretarComOpenAi } from '../../supabase/functions/_shared/uniInterpret/provedores.js';
import { catalogoDoWorkspace } from '../../src/features/uni-interpret/evalCatalog.js';
import {
  correcaoDoRascunho,
  montarRascunhoParaInterpretacao,
} from '../../src/features/uni-interpret/uniInterpretClient.js';

const indiceModelo = process.argv.indexOf('--modelo');
const modelo = indiceModelo >= 0 ? process.argv[indiceModelo + 1] : 'gpt-5.6-luna';
const HOJE = '2026-10-11';
const categorias = catalogoDoWorkspace('personal');
const contas = [{ id: 'conta-nu', name: 'Nubank' }, { id: 'conta-itau', name: 'Itaú' }];
const categoria = (nome) => categorias.find((item) => item.name === nome);

const SEM_VALOR = {
  transactionType: 'expense', amount: null, date: HOJE, description: 'Impostos', category: categoria('Outras despesas'), account: null,
};
const MERCADO = {
  transactionType: 'expense', amount: 85, date: HOJE, description: 'Mercado', category: categoria('Alimentação'), account: contas[0],
};
const PERGUNTA_VALOR = [
  { autor: 'usuario', texto: 'Vamos criar uma categoria chamada Impostos.' },
  { autor: 'uni', texto: 'Qual foi o valor dessa movimentação?' },
];
// Sem pedido de categoria no histórico: a resposta só traz o valor.
const PERGUNTA_VALOR_NEUTRA = [
  { autor: 'usuario', texto: 'Quero lançar uma despesa de impostos.' },
  { autor: 'uni', texto: 'Qual foi o valor dessa movimentação?' },
];
const CARD = [
  { autor: 'usuario', texto: 'Gastei 85 no mercado pelo Nubank' },
  { autor: 'uni', texto: 'Perfeito. Revise as informações abaixo antes de registrar.' },
];

// esperado: o que correcaoDoRascunho devolve; null quando a frase fica com
// as regras (outro gasto, pergunta, nada muda).
const CASOS = [
  {
    id: 'voz-11-10-frase-inteira',
    rascunho: SEM_VALOR,
    historico: PERGUNTA_VALOR,
    frase: 'Registrar uma despesa de cinco mil e quinhentos reais no dia quinze de outubro, com a categoria Impostos.',
    esperado: { overrides: { amount: 5500, date: '2026-10-15' }, novaCategoria: 'Impostos' },
  },
  { id: 'so-valor', rascunho: SEM_VALOR, historico: PERGUNTA_VALOR_NEUTRA, frase: 'cinco mil e quinhentos', esperado: { overrides: { amount: 5500 }, novaCategoria: null } },
  { id: 'so-categoria-nova', rascunho: SEM_VALOR, historico: PERGUNTA_VALOR, frase: 'A categoria é Impostos', esperado: { overrides: {}, novaCategoria: 'Impostos' } },
  { id: 'valor', rascunho: MERCADO, historico: CARD, frase: 'na verdade foi 150', esperado: { overrides: { amount: 150 }, novaCategoria: null } },
  { id: 'conta', rascunho: MERCADO, historico: CARD, frase: 'não, foi no Itaú', esperado: { overrides: { accountId: 'conta-itau' }, novaCategoria: null } },
  { id: 'data', rascunho: MERCADO, historico: CARD, frase: 'foi ontem', esperado: { overrides: { date: '2026-10-10' }, novaCategoria: null } },
  { id: 'categoria', rascunho: MERCADO, historico: CARD, frase: 'muda a categoria pra Lazer', esperado: { overrides: { categoryId: categoria('Lazer').id }, novaCategoria: null } },
  { id: 'outro-gasto', rascunho: MERCADO, historico: CARD, frase: 'paguei 40 de uber também', esperado: null },
  { id: 'pergunta', rascunho: MERCADO, historico: CARD, frase: 'quanto gastei com mercado esse mês?', esperado: null },
  { id: 'nada-muda', rascunho: MERCADO, historico: CARD, frase: 'hum, deixa eu ver', esperado: null },
];

let acertos = 0;
for (const caso of CASOS) {
  const mensagem = montarMensagemUsuario({
    frase: caso.frase,
    dataReferencia: HOJE,
    categorias,
    contas,
    rascunho: montarRascunhoParaInterpretacao(caso.rascunho),
    historico: caso.historico,
  });
  const inicio = performance.now();
  const chamada = await interpretarComOpenAi({
    chave: process.env.OPENAI_API_KEY,
    modelo,
    instrucoes: INSTRUCOES,
    mensagem,
    sinal: AbortSignal.timeout(20000),
    temperatura: null,
  });
  const duracao = Math.round(performance.now() - inicio);
  if (!chamada.ok) {
    console.log(`XX  ${caso.id}  FALHA ${chamada.motivo}`);
    continue;
  }
  const validada = validarInterpretacao(chamada.bruta, { categorias, contas, dataReferencia: HOJE });
  const obtido = correcaoDoRascunho(validada, caso.rascunho);
  const acertou = JSON.stringify(obtido) === JSON.stringify(caso.esperado);
  if (acertou) acertos += 1;
  console.log(`${acertou ? 'ok' : 'XX'}  ${caso.id}  ${duracao}ms  ${validada.intent}  ${JSON.stringify(obtido)}`);
}
console.log(`\n${modelo}: ${acertos}/${CASOS.length}`);
