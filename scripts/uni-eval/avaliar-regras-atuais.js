/* global process */
// Mede o interpretador determinístico atual contra o conjunto de avaliação
// (épico #104, F0). Reproduz o caminho de sendText sem a IA: classifyIntent,
// parseFinancialText e buildFinancialIntentAction com o catálogo de sistema.
// Consultas são respondidas depois por financialQueryEngine, fora deste
// caminho: aqui só conta se classifyIntent as reconhece.
//
// Uso: npm run uni:eval -- [--erros] [--conjunto ajuste|reservado|todos]
//   --erros     lista só os casos com algum campo errado.
//   --conjunto  ajuste, reservado ou todos (padrão).

import { buildFinancialIntentAction } from '../../src/features/uni-conversation/financialIntentAction.js';
import { parseFinancialText } from '../../src/features/uni-intents/index.js';
import {
  AGENDA_INTENT_SET,
  classifyIntent,
  stripLeadingConversationalPrefix,
} from '../../src/features/uni-intents/intentClassifier.js';
import { catalogoDoWorkspace } from '../../src/features/uni-interpret/evalCatalog.js';
import { CASOS, DATA_REFERENCIA } from '../../src/features/uni-interpret/evalCases.js';
import { avaliarCaso, resumirAvaliacao } from '../../src/features/uni-interpret/evalScoring.js';

const INTENT_PARA_GRUPO = {
  register_expense: 'lancar_saida',
  register_income: 'lancar_entrada',
  register_transfer: 'transferir',
  set_balance: 'saldo',
  ambiguous_balance_or_income: 'saldo',
  create_goal: 'meta',
  check_balance: 'saldo',
  forecast: 'consulta',
  question: 'consulta',
  conversation_common: 'conversa',
};

// Sem nenhuma regra casada, classifyIntent devolve 'question' com signals
// vazio: isso é "não entendi", e não uma consulta reconhecida.
function grupoDoIntent(intent, frase) {
  if (AGENDA_INTENT_SET.has(intent)) return 'agenda';
  if (intent === 'question') {
    const texto = stripLeadingConversationalPrefix(frase) || frase;
    if (classifyIntent(texto).signals.length === 0) return 'nao_entendeu';
  }
  return INTENT_PARA_GRUPO[intent] ?? intent;
}

function modoDaCategoria(action) {
  if (action.category) return 'resolveu';
  if (action.proposedCategory) return 'sugeriu';
  if (action.proposedCategoryName) return 'propos_criar';
  return 'perguntou';
}

function interpretarComRegrasAtuais(caso) {
  const workspaceType = caso.workspace ?? 'personal';
  const parsed = parseFinancialText(caso.frase, { referenceDate: DATA_REFERENCIA });
  const action = buildFinancialIntentAction({
    parsed,
    categories: catalogoDoWorkspace(workspaceType),
    referenceDate: DATA_REFERENCIA,
    workspaceType,
  });

  return {
    intent: grupoDoIntent(parsed.intent, caso.frase),
    valor: action.amount ?? parsed.entities.amount ?? null,
    data: action.date ?? null,
    categoria: action.category?.name ?? action.proposedCategory?.name ?? action.proposedCategoryName ?? null,
    modoCategoria: modoDaCategoria(action),
    descricao: action.description ?? null,
  };
}

function marca(veredito) {
  if (veredito === null) return '·';
  return veredito ? 'ok' : 'XX';
}

const soErros = process.argv.includes('--erros');
const CONJUNTOS = ['ajuste', 'reservado', 'todos'];
const indiceConjunto = process.argv.indexOf('--conjunto');
const conjunto = indiceConjunto >= 0 ? process.argv[indiceConjunto + 1] : 'todos';
if (!CONJUNTOS.includes(conjunto)) {
  console.error('Informe --conjunto ajuste|reservado|todos.');
  process.exit(1);
}
// Memória e rascunho (#79) só existem no caminho do uni-interpret: as regras
// não leem memória e respondem ao card por outro fluxo.
const casosDoConjunto = CASOS.filter((caso) => (
  (conjunto === 'todos' || (conjunto === 'reservado') === Boolean(caso.reservado))
  && !caso.memorias && !caso.rascunho
));
const vereditos = [];

for (const caso of casosDoConjunto) {
  const resultado = interpretarComRegrasAtuais(caso);
  const veredito = avaliarCaso(caso, resultado);
  vereditos.push(veredito);

  const errou = Object.values(veredito).some((valor) => valor === false);
  if (soErros && !errou) continue;

  const esperado = caso.esperado.categoria === undefined ? '' : ` | esperado: ${caso.esperado.categoria ?? '(perguntar)'}`;
  console.log(
    `${marca(veredito.intent).padEnd(2)} ${marca(veredito.valor).padEnd(2)} ${marca(veredito.data).padEnd(2)} ${marca(veredito.categoria).padEnd(2)} ${marca(veredito.modalidade).padEnd(2)} ${marca(veredito.consulta).padEnd(2)}  ${caso.id}`,
  );
  console.log(
    `      ${resultado.intent} | ${resultado.valor ?? '-'} | ${resultado.data ?? '-'} | ${resultado.categoria ?? '-'} (${resultado.modoCategoria})${esperado} | "${resultado.descricao ?? ''}"`,
  );
}

console.log(`\nregras atuais — conjunto ${conjunto} (${casosDoConjunto.length} casos)`);
console.log('intent valor data categoria — acertos por campo');
for (const [campo, { acertos, total }] of Object.entries(resumirAvaliacao(vereditos))) {
  const pct = total ? Math.round((acertos / total) * 100) : 0;
  console.log(`${campo.padEnd(10)} ${String(acertos).padStart(3)}/${total}  ${pct}%`);
}
