// Edição de um lançamento já salvo, pedida em conversa ("corrige o mercado
// de ontem pra cinquenta", "o Uber de segunda foi no Nubank"). Tudo aqui é
// puro: separa o lançamento procurado da mudança pedida, acha o lançamento
// e monta a alteração que o card mostra. Quem grava é o chat, depois de a
// pessoa confirmar.
import {
  extractAmount,
  normalizeFinancialText,
  parseFinancialText,
  resolveRelativeDateExpression,
} from '../uni-intents/index.js';
import { formatCurrency } from '../../utils/formatters.js';
import { normalizeSearchText } from '../../utils/searchText.js';
import { collectCorrectionOverrides, extractRequestedCategoryName } from './pendingActionInput.js';

// actionKind do card de alteração (confirmationCardModel.js).
export const ACTION_KIND_EDICAO = 'edit_transaction';

export const FORMAS_DE_EDICAO = Object.freeze({
  VERBO: 'verbo',
  COPULA: 'copula',
  ULTIMO: 'ultimo',
});

const ABERTURA = String.raw`(?:(?:uni|ops|opa|ah|ei)[,.!]?\s+)*(?:por\s+favor,?\s+)?(?:(?:eu\s+)?(?:quero|queria|preciso|gostaria\s+de)\s+|(?:voce\s+)?(?:pode|consegue|poderia)\s+)?`;
const VERBO = String.raw`(?:corrige|corrigir|corrija|muda|mudar|mude|altera|alterar|altere|troca|trocar|troque|ajusta|ajustar|ajuste|edita|editar|edite|atualiza|atualizar|atualize)`;
const CAMPO = String.raw`(valor|data|categoria|conta|descricao)`;
const LIGACAO_DO_CAMPO = String.raw`(?:do|da|dos|das|desse|dessa|deste|desta)`;
const SEPARADOR = String.raw`(?:pra|para|pro|por)`;

// "corrige o mercado de ontem pra 50", "muda a categoria do iFood de sexta
// pra Lazer". O alvo é guloso: a mudança começa no ÚLTIMO "pra". Na
// descrição é o contrário: "muda a descrição do presente pra Presente pra
// mãe" muda a partir do PRIMEIRO.
const PEDIDO_COM_VERBO = new RegExp(
  `^${ABERTURA}${VERBO}\\s+(?:(?:o|a)\\s+)?(?:${CAMPO}\\s+${LIGACAO_DO_CAMPO}\\s+)?(.+)\\s+${SEPARADOR}\\s+(.+)$`,
);
const PEDIDO_DE_DESCRICAO = new RegExp(
  `^${ABERTURA}${VERBO}\\s+(?:a\\s+)?descricao\\s+${LIGACAO_DO_CAMPO}\\s+(.+?)\\s+${SEPARADOR}\\s+(.+)$`,
);
// "troca de óleo do carro por 200 reais" é lançamento novo: sem o nome do
// campo, o lançamento procurado não começa com preposição.
const ALVO_QUE_E_SUBSTANTIVO = /^(?:de|do|da|dos|das)\s/;
// "corrige pra 50", "muda o valor pra 50": vale para o último lançamento
// confirmado na conversa.
const PEDIDO_SEM_ALVO = new RegExp(`^${ABERTURA}${VERBO}\\s+(?:(?:o|a)\\s+${CAMPO}\\s+)?${SEPARADOR}\\s+(.+)$`);
const CORRECAO_DO_ULTIMO = /^(?:(?:ops|opa|ah)[,.!]?\s+)?(?:na verdade|na real),?\s+(?:foi|era|foram|eram)\s+(.+)$/;
// "o Uber de segunda foi no Nubank", "o iFood de sexta era da categoria
// Lazer". Sem verbo de edição, só vale para conta ou categoria: "o almoço
// foi 30 reais" é lançamento novo.
const PEDIDO_COPULA = /^(?:o|a)\s+(.+?)\s+(?:na verdade\s+)?(?:foi|era)\s+(?:(?:no|na|pelo|pela|com\s+o|com\s+a)\s+(?!categoria\b)(.+)|(?:da\s+|na\s+|de\s+)?categoria\s+(.+))$/;

const REFERENCIA_AO_ULTIMO = /^(?:(?:o|a)\s+)?(?:ultim[oa]|esse|essa|este|esta|isso|ele|ela)(?:\s+(?:lancamento|registro|gasto|despesa|receita|movimentacao|compra))?(?:\s+que\s+(?:eu\s+)?(?:fiz|lancei|registrei|anotei))?$/;

function limparFrase(texto) {
  return normalizeFinancialText(texto).replace(/[.!]+$/g, '').trim();
}

// O casamento roda no texto normalizado; descrição e nome de categoria
// voltam com a caixa e os acentos que a pessoa usou. Remover acento não muda
// o tamanho de um texto em NFC, então o fim da frase original corresponde
// ao fim da normalizada.
function recortarOriginal(texto, trechoNormalizado) {
  const original = texto.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/[.!]+$/g, '').trim();
  const recorte = original.slice(original.length - trechoNormalizado.length);
  return normalizeFinancialText(recorte) === trechoNormalizado ? recorte : trechoNormalizado;
}

// Mudança pedida, já resolvida contra contas e categorias do espaço.
// campo: o nome do campo dito na frase, quando houver. Devolve
// { mudancas } ou { categoriaPedida } quando a categoria não existe.
export function lerMudanca(textoDaMudanca, campo, { accounts = [], categories = [], workspaceId = null, referenceDate } = {}) {
  const texto = typeof textoDaMudanca === 'string' ? textoDaMudanca.trim().replace(/[.!]+$/g, '') : '';
  if (!texto) return null;
  if (campo === 'descricao') {
    const descricao = texto.replace(/^(?:o|a)\s+/i, '').trim();
    return descricao.length >= 2 ? { mudancas: { description: descricao } } : null;
  }
  const normalizado = normalizeFinancialText(texto);
  const parsed = parseFinancialText(texto, { referenceDate });
  const coletado = collectCorrectionOverrides({
    text: texto,
    normalized: normalizado,
    parsed,
    accounts,
    categories,
    workspaceId,
  }) ?? {};
  const porCampo = {
    valor: ['amount'],
    data: ['date'],
    conta: ['accountId'],
    categoria: ['categoryId'],
  }[campo];
  const mudancas = Object.fromEntries(
    Object.entries(coletado).filter(([chave]) => !porCampo || porCampo.includes(chave)),
  );
  // A data nova depende do lançamento, que ainda não foi achado: num previsto,
  // "dia 20" ou "sexta" são os próximos. montarAlteracao escolhe.
  if (mudancas.date) {
    const datePlanned = parseFinancialText(texto, { referenceDate, lookAhead: true }).entities.date;
    if (datePlanned && datePlanned !== mudancas.date) mudancas.datePlanned = datePlanned;
  }
  if (Object.keys(mudancas).length) return { mudancas };
  if (campo === 'categoria') {
    const nome = extractRequestedCategoryName(`categoria ${texto}`) || texto;
    return { categoriaPedida: nome };
  }
  return null;
}

// null quando a frase não é pedido de edição de lançamento salvo.
export function interpretarPedidoDeEdicao(texto, contexto = {}) {
  if (typeof texto !== 'string' || /\?\s*$/.test(texto)) return null;
  const frase = limparFrase(texto);
  if (!frase) return null;

  const semAlvo = frase.match(PEDIDO_SEM_ALVO) ?? null;
  if (semAlvo) {
    const [, campo, textoDaMudanca] = semAlvo;
    const mudanca = lerMudanca(recortarOriginal(texto, textoDaMudanca), campo, contexto);
    return mudanca ? { forma: FORMAS_DE_EDICAO.ULTIMO, alvo: '', ...mudanca } : null;
  }

  const deDescricao = frase.match(PEDIDO_DE_DESCRICAO);
  const comVerbo = deDescricao ? [deDescricao[0], 'descricao', deDescricao[1], deDescricao[2]] : frase.match(PEDIDO_COM_VERBO);
  if (comVerbo) {
    const [, campo, alvo, textoDaMudanca] = comVerbo;
    if (!campo && ALVO_QUE_E_SUBSTANTIVO.test(alvo)) return null;
    const mudanca = lerMudanca(recortarOriginal(texto, textoDaMudanca), campo, contexto);
    if (!mudanca) return null;
    if (REFERENCIA_AO_ULTIMO.test(alvo.trim())) {
      // "o último lançamento" vale mesmo sem nada confirmado na conversa;
      // "esse" e "isso" só se referem ao que acabou de ser confirmado.
      return { forma: FORMAS_DE_EDICAO.ULTIMO, alvo: '', ultimoExplicito: /\bultim[oa]\b/.test(alvo), ...mudanca };
    }
    return { forma: FORMAS_DE_EDICAO.VERBO, alvo: alvo.trim(), ...mudanca };
  }

  const doUltimo = frase.match(CORRECAO_DO_ULTIMO);
  if (doUltimo) {
    const mudanca = lerMudanca(doUltimo[1], null, contexto);
    return mudanca ? { forma: FORMAS_DE_EDICAO.ULTIMO, alvo: '', ...mudanca } : null;
  }

  const copula = frase.match(PEDIDO_COPULA);
  if (copula) {
    const [, alvo, textoDaConta, textoDaCategoria] = copula;
    if (Number(extractAmount(alvo)) > 0) return null;
    const mudanca = textoDaConta
      ? lerMudanca(textoDaConta, 'conta', contexto)
      : lerMudanca(recortarOriginal(texto, textoDaCategoria), 'categoria', contexto);
    // Conta que não existe ou categoria que não existe: não é pedido de
    // edição, segue o caminho de sempre.
    if (!mudanca?.mudancas) return null;
    return { forma: FORMAS_DE_EDICAO.COPULA, alvo: alvo.trim(), ...mudanca };
  }

  return null;
}

// Ajuste falado com o card de alteração na tela: "não, pra 60", "na verdade
// foi 60", "muda a data pra ontem". Vale para o mesmo lançamento do card.
export function lerAjusteDaAlteracao(texto, contexto = {}) {
  if (typeof texto !== 'string' || /\?\s*$/.test(texto)) return null;
  const semNao = texto.trim().replace(/^n[ãa]o[,.!]?\s*/i, '');
  const frase = limparFrase(semNao);
  if (!frase) return null;
  const pedido = interpretarPedidoDeEdicao(semNao, contexto);
  if (pedido?.forma === FORMAS_DE_EDICAO.ULTIMO) return pedido;
  const solto = frase.match(/^(?:e\s+)?(?:pra|para|pro|por|foi|era|foram|eram)\s+(.+)$/);
  if (!solto) return null;
  const mudanca = lerMudanca(recortarOriginal(texto, solto[1]), null, contexto);
  return mudanca?.mudancas ? { forma: FORMAS_DE_EDICAO.ULTIMO, alvo: '', ...mudanca } : null;
}

// Palavras que não descrevem o lançamento: artigos, preposições, o próprio
// substantivo "lançamento" e as palavras de data e valor, que viram filtro
// próprio.
const PALAVRAS_VAZIAS = new Set([
  'o', 'a', 'os', 'as', 'do', 'da', 'dos', 'das', 'de', 'no', 'na', 'nos', 'nas', 'em', 'um', 'uma',
  'e', 'que', 'eu', 'meu', 'minha', 'com', 'pelo', 'pela', 'la', 'ai', 'aquele', 'aquela',
  'lancamento', 'lancamentos', 'registro', 'gasto', 'gastos', 'despesa', 'despesas', 'receita',
  'receitas', 'compra', 'compras', 'movimentacao', 'entrada', 'saida', 'valor',
  'fiz', 'paguei', 'gastei', 'comprei', 'lancei', 'registrei', 'recebi', 'foi',
  'hoje', 'ontem', 'anteontem', 'dia', 'feira', 'passado', 'passada', 'semana', 'mes',
  'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado',
  'reais', 'real', 'r$', 'rs', 'centavos',
  'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
  'treze', 'quatorze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
  'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa',
  'cem', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
  'setecentos', 'oitocentos', 'novecentos', 'mil',
]);

// Só datas que apontam um dia certo filtram. "Semana passada" resolve para
// um dia exato e esconderia o lançamento da terça.
const REGRAS_DE_DATA_EXATA = new Set(['today', 'yesterday', 'day_before_yesterday', 'explicit_date', 'day_of_month', 'weekday_previous']);

function contaCitada(textoNormalizado, accounts, workspaceId) {
  const nomes = (Array.isArray(accounts) ? accounts : [])
    .filter((conta) => conta?.is_active !== false)
    .filter((conta) => !workspaceId || !conta?.workspace_id || conta.workspace_id === workspaceId)
    .map((conta) => ({ conta, nome: normalizeSearchText(conta.name) }))
    .filter(({ nome }) => nome && new RegExp(`(?:^|\\s)${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(textoNormalizado))
    .sort((a, b) => b.nome.length - a.nome.length);
  return nomes[0] ?? null;
}

// Critérios do lançamento procurado: data, valor, conta e palavras da
// descrição ou categoria.
const DATA_CURTA = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/;
const EXPRESSOES_DE_DATA = /\bdia\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g;

// "05/10" sem ano é a ocorrência mais recente que não está no futuro.
function resolverDataCurta(dia, mes, ano, referenceDate) {
  const referencia = /^\d{4}-\d{2}-\d{2}$/.test(referenceDate ?? '') ? referenceDate : null;
  const anoDito = ano ? Number(ano.length === 2 ? `20${ano}` : ano) : null;
  const anoBase = anoDito ?? Number((referencia ?? '').slice(0, 4));
  if (!anoBase) return null;
  const montar = (umAno) => {
    const data = new Date(Date.UTC(umAno, Number(mes) - 1, Number(dia)));
    return data.getUTCDate() === Number(dia) && data.getUTCMonth() === Number(mes) - 1
      ? data.toISOString().slice(0, 10)
      : null;
  };
  const candidata = montar(anoBase);
  if (!candidata || anoDito || !referencia || candidata <= referencia) return candidata;
  return montar(anoBase - 1);
}

export function analisarAlvo(textoDoAlvo, { accounts = [], workspaceId = null, referenceDate } = {}) {
  // Ponto e vírgula entre dígitos ficam: "1.500" e "32,50" são valores.
  const normalizado = normalizeSearchText(textoDoAlvo)
    .replace(/[!;:?]+/g, ' ')
    .replace(/[.,](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalizado) return { criterios: 0 };

  const dataCurta = normalizado.match(DATA_CURTA);
  const resolucao = dataCurta ? null : resolveRelativeDateExpression(normalizado, referenceDate);
  const data = dataCurta
    ? resolverDataCurta(dataCurta[1], dataCurta[2], dataCurta[3], referenceDate)
    : (REGRAS_DE_DATA_EXATA.has(resolucao.ruleId) ? resolucao.resolvedDate : null);
  // O número de "dia 5" e de "05/10" é data, não valor.
  const semData = normalizado.replace(EXPRESSOES_DE_DATA, ' ');
  const valorExtraido = Number(extractAmount(semData));
  const valor = valorExtraido > 0 ? valorExtraido : null;
  const citada = contaCitada(normalizado, accounts, workspaceId);

  let restante = semData
    .replace(/r\$\s*/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)*\b/g, ' ')
    .replace(/[.,]/g, ' ');
  if (citada) restante = restante.replace(citada.nome, ' ');
  const palavras = restante
    .split(/\s+/)
    .map((palavra) => palavra.replace(/-feira$/, ''))
    .filter((palavra) => palavra.length >= 2 && !PALAVRAS_VAZIAS.has(palavra));

  return {
    data,
    valor,
    contaId: citada?.conta.id ?? null,
    palavras,
    criterios: [data, valor, citada].filter(Boolean).length + palavras.length,
  };
}

function textoPesquisavel(transacao, categoriasPorId) {
  const categoria = categoriasPorId.get(transacao.category_id)?.name ?? '';
  return normalizeSearchText(`${transacao.description ?? ''} ${categoria}`);
}

function palavraBate(texto, palavra) {
  if (texto.includes(palavra)) return true;
  // "mercados" acha "Mercado"; "uber" não precisa de mais nada.
  return palavra.length > 3 && palavra.endsWith('s') && texto.includes(palavra.slice(0, -1));
}

// Todas as palavras aparecem na descrição ou na categoria do lançamento.
export function bateComPalavras(transacao, palavras, categories = []) {
  if (!palavras?.length) return false;
  const texto = textoPesquisavel(transacao, categoriasIndexadas(categories));
  return palavras.every((palavra) => palavraBate(texto, palavra));
}

function bateComAlvo(transacao, alvo, categoriasPorId) {
  if (alvo.data && transacao.transaction_date !== alvo.data) return false;
  if (alvo.valor && Math.abs(Number(transacao.amount) - alvo.valor) >= 0.005) return false;
  if (alvo.contaId && transacao.account_id !== alvo.contaId) return false;
  if (alvo.palavras?.length) {
    const texto = textoPesquisavel(transacao, categoriasPorId);
    if (!alvo.palavras.every((palavra) => palavraBate(texto, palavra))) return false;
  }
  return true;
}

function categoriasIndexadas(categories) {
  return new Map((Array.isArray(categories) ? categories : []).map((categoria) => [categoria.id, categoria]));
}

function maisRecentesPrimeiro(a, b) {
  return String(b.transaction_date ?? '').localeCompare(String(a.transaction_date ?? ''))
    || String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
}

// Por que a conversa não edita este lançamento; null quando pode.
export function motivoDeBloqueio(transacao) {
  if (!transacao) return 'Não encontrei esse lançamento.';
  if (transacao.status === 'canceled') return 'Esse lançamento foi cancelado e não pode ser alterado.';
  if (transacao.transaction_type === 'transfer') {
    return 'Transferências só podem ser alteradas na tela Financeiro.';
  }
  if (transacao.transaction_type === 'adjustment') {
    return 'Ajustes de saldo só podem ser alterados na tela Financeiro.';
  }
  if (transacao.metadata?.installment_group_id || Number(transacao.installment_total) > 1) {
    return 'Esse lançamento é uma parcela. Altere na tela Financeiro, que pergunta se a mudança vale também para as outras parcelas.';
  }
  if (transacao.source_type === 'import' || transacao.source_type === 'open_finance') {
    return 'Esse lançamento veio de uma importação e só pode ser alterado na tela Financeiro.';
  }
  return null;
}

// { tipo: 'unico' | 'varios' | 'nenhum' | 'bloqueado', transacao?,
// candidatos?, motivo? }. Todos os critérios ditos precisam bater: nunca
// afrouxa para achar "algum mercado".
export function localizarLancamento(alvo, transacoes, { categories = [], limite = 5 } = {}) {
  if (!alvo?.criterios) return { tipo: 'nenhum' };
  const categoriasPorId = categoriasIndexadas(categories);
  const achados = (Array.isArray(transacoes) ? transacoes : [])
    .filter((transacao) => transacao && transacao.status !== 'canceled')
    .filter((transacao) => bateComAlvo(transacao, alvo, categoriasPorId))
    .sort(maisRecentesPrimeiro);
  if (!achados.length) return { tipo: 'nenhum' };

  const editaveis = achados.filter((transacao) => !motivoDeBloqueio(transacao));
  if (!editaveis.length) {
    return { tipo: 'bloqueado', transacao: achados[0], motivo: motivoDeBloqueio(achados[0]) };
  }
  if (editaveis.length === 1) return { tipo: 'unico', transacao: editaveis[0] };
  return { tipo: 'varios', candidatos: editaveis.slice(0, limite), total: editaveis.length };
}

const ORDINAIS = Object.freeze({
  primeiro: 0, primeira: 0, um: 0, '1': 0,
  segundo: 1, dois: 1, '2': 1,
  terceiro: 2, terceira: 2, tres: 2, '3': 2,
  quarto: 3, quatro: 3, '4': 3,
  quinto: 4, cinco: 4, '5': 4,
});

// Resposta à lista "qual deles?": "o segundo", "o de 85", "o do Nubank",
// "o de ontem". "A segunda", "a quarta" e "a quinta" são dias da semana,
// não posições. null quando não dá para saber qual.
export function escolherCandidato(resposta, candidatos, contexto = {}) {
  const lista = Array.isArray(candidatos) ? candidatos : [];
  const frase = normalizeSearchText(resposta).replace(/[.,!]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!frase || !lista.length) return null;

  const ordinal = frase.match(/^(?:(?:e|foi|era)\s+)?(?:(?:o|a)\s+)?(?:(?:numero|opcao)\s+)?(primeir[oa]|segundo|terceir[oa]|quarto|quinto|um|dois|tres|quatro|cinco|[1-5])(?:\s+(?:lancamento|da\s+lista|opcao))?$/);
  if (ordinal) {
    const indice = ORDINAIS[ordinal[1]];
    return indice < lista.length ? lista[indice] : null;
  }
  if (/^(?:(?:e|foi|era)\s+)?(?:(?:o|a)\s+)?ultim[oa](?:\s+da\s+lista)?$/.test(frase)) return lista.at(-1);

  const alvo = analisarAlvo(frase, contexto);
  if (!alvo.criterios) return null;
  const categoriasPorId = categoriasIndexadas(contexto.categories);
  const achados = lista.filter((transacao) => bateComAlvo(transacao, alvo, categoriasPorId));
  return achados.length === 1 ? achados[0] : null;
}

function nomeDe(lista, id) {
  return (Array.isArray(lista) ? lista : []).find((item) => item?.id === id)?.name ?? null;
}

// Alteração pronta para o card e para o update. { erro } quando a mudança
// não pode ser aplicada a este lançamento.
// Confirmar um previsto (#262) só muda situação, data e valor, como o "Marcar
// como pago" da tela: parcela pode, porque nada passa para as outras.
function motivoDeBloqueioDaConfirmacao(transacao) {
  if (!transacao || transacao.status === 'canceled') return 'Esse lançamento foi cancelado e não pode ser confirmado.';
  if (transacao.status !== 'pending') return 'Esse lançamento já está realizado.';
  if (transacao.transaction_type === 'adjustment') return 'Ajustes de saldo só podem ser alterados na tela Financeiro.';
  if (transacao.source_type === 'import' || transacao.source_type === 'open_finance') {
    return 'Esse lançamento veio de uma importação e só pode ser alterado na tela Financeiro.';
  }
  return null;
}

export function montarAlteracao(transacao, mudancas, { accounts = [], categories = [], referenceDate } = {}) {
  const pedidas = mudancas ?? {};
  const bloqueio = pedidas.confirmar ? motivoDeBloqueioDaConfirmacao(transacao) : motivoDeBloqueio(transacao);
  if (bloqueio) return { erro: bloqueio };
  const alteracoes = {};
  const campos = [];

  if (pedidas.amount !== undefined) {
    const valor = Math.round(Number(pedidas.amount) * 100) / 100;
    if (!(valor > 0)) return { erro: 'O valor precisa ser maior que zero.' };
    if (Math.abs(valor - Number(transacao.amount)) >= 0.005) {
      alteracoes.amount = valor;
      campos.push({ campo: 'amount', antes: Number(transacao.amount), depois: valor });
    }
  }
  const novaData = transacao.status === 'pending' && pedidas.datePlanned ? pedidas.datePlanned : pedidas.date;
  if (novaData !== undefined && novaData !== transacao.transaction_date) {
    alteracoes.transaction_date = novaData;
    campos.push({ campo: 'date', antes: transacao.transaction_date, depois: novaData });
    // Data depois de hoje é previsto, como no formulário: sai do saldo até
    // a pessoa confirmar. O card mostra a mudança.
    if (transacao.status === 'completed' && referenceDate && novaData > referenceDate) {
      alteracoes.status = 'pending';
      campos.push({ campo: 'status', antes: 'completed', depois: 'pending' });
    }
  }
  if (pedidas.confirmar) {
    alteracoes.status = 'completed';
    campos.push({ campo: 'status', antes: 'pending', depois: 'completed' });
  }
  if (pedidas.accountId !== undefined && pedidas.accountId !== transacao.account_id) {
    const conta = (Array.isArray(accounts) ? accounts : []).find((item) => item?.id === pedidas.accountId);
    if (!conta || conta.is_active === false) return { erro: 'Essa conta não está ativa neste espaço.' };
    alteracoes.account_id = conta.id;
    campos.push({ campo: 'account', antes: nomeDe(accounts, transacao.account_id), depois: conta.name });
  }
  if (pedidas.categoryId !== undefined && pedidas.categoryId !== transacao.category_id) {
    const categoria = (Array.isArray(categories) ? categories : []).find((item) => item?.id === pedidas.categoryId);
    if (!categoria || categoria.is_active === false) return { erro: 'Essa categoria não está ativa neste espaço.' };
    if (categoria.category_type !== transacao.transaction_type) {
      return {
        erro: transacao.transaction_type === 'income'
          ? `${categoria.name} é uma categoria de despesa e esse lançamento é uma receita.`
          : `${categoria.name} é uma categoria de receita e esse lançamento é uma despesa.`,
      };
    }
    alteracoes.category_id = categoria.id;
    campos.push({ campo: 'category', antes: nomeDe(categories, transacao.category_id), depois: categoria.name });
  }
  if (pedidas.description !== undefined) {
    const descricao = String(pedidas.description).trim();
    if (descricao && descricao !== (transacao.description ?? '').trim()) {
      alteracoes.description = descricao;
      campos.push({ campo: 'description', antes: transacao.description ?? '', depois: descricao });
    }
  }

  if (!campos.length) return { erro: 'Esse lançamento já está assim. Nada mudou.' };
  return { alteracoes, campos };
}

export function formatarValor(valor) {
  return formatCurrency(valor);
}

export function formatarData(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

const ROTULOS_DOS_CAMPOS = Object.freeze({
  amount: 'Valor',
  date: 'Data',
  account: 'Conta',
  category: 'Categoria',
  description: 'Descrição',
  status: 'Situação',
});

const ROTULOS_DA_SITUACAO = Object.freeze({
  completed: 'realizado',
  pending: 'previsto',
});

function formatarCampo(campo, valor) {
  if (campo === 'amount') return formatarValor(valor);
  if (campo === 'date') return formatarData(valor);
  if (campo === 'status') return ROTULOS_DA_SITUACAO[valor] ?? valor;
  return valor || 'sem nenhuma';
}

export function descreverLancamento(transacao, { accounts = [] } = {}) {
  const partes = [
    transacao.description || (transacao.transaction_type === 'income' ? 'Receita' : 'Despesa'),
    formatarValor(transacao.amount),
    nomeDe(accounts, transacao.account_id),
    formatarData(transacao.transaction_date),
  ].filter(Boolean);
  return partes.join(', ');
}

// Linhas do card no formato "antes → depois", mais a identificação do
// lançamento. Uma linha por campo que muda.
export function linhasDaAlteracao(transacao, campos, { accounts = [] } = {}) {
  const linhas = [
    { key: 'edit-target', label: 'Lançamento', value: transacao.description || 'Sem descrição' },
  ];
  if (!campos.some(({ campo }) => campo === 'date')) {
    linhas.push({ key: 'edit-date', label: 'Data', value: formatarData(transacao.transaction_date) });
  }
  if (!campos.some(({ campo }) => campo === 'amount')) {
    linhas.push({ key: 'edit-amount', label: 'Valor', value: formatarValor(transacao.amount) });
  }
  if (!campos.some(({ campo }) => campo === 'account')) {
    const conta = nomeDe(accounts, transacao.account_id);
    if (conta) linhas.push({ key: 'edit-account', label: 'Conta', value: conta });
  }
  for (const { campo, antes, depois } of campos) {
    linhas.push({
      key: `edit-change-${campo}`,
      label: ROTULOS_DOS_CAMPOS[campo],
      value: `${formatarCampo(campo, antes)} → ${formatarCampo(campo, depois)}`,
      emphasis: true,
    });
  }
  return linhas;
}

// Card de confirmação da alteração. Sem "Editar": o ajuste é falado ("não,
// pra 60") e refaz o card.
function confirmaPrevisto(campos) {
  return campos.some(({ campo, depois }) => campo === 'status' && depois === 'completed');
}

function verboDaConfirmacao(transacao) {
  if (transacao.transaction_type === 'income') return 'recebido';
  if (transacao.transaction_type === 'transfer') return 'realizado';
  return 'pago';
}

export function cardDaAlteracao(transacao, campos, contexto = {}) {
  return {
    title: confirmaPrevisto(campos) ? 'Confirmar previsto' : 'Alterar lançamento',
    status: 'pending',
    actionKind: ACTION_KIND_EDICAO,
    editable: false,
    rows: linhasDaAlteracao(transacao, campos, contexto),
  };
}

// O que a Uni diz junto do card. É este texto que a conversa por voz fala.
export function textoDaAlteracao(transacao, campos) {
  const nome = transacao.description || 'esse lançamento';
  if (confirmaPrevisto(campos)) {
    const data = campos.find(({ campo }) => campo === 'date')?.depois ?? transacao.transaction_date;
    const valor = campos.find(({ campo }) => campo === 'amount')?.depois;
    const comValor = valor === undefined ? '' : `, com valor ${formatarValor(valor)}`;
    return `${nome}, de ${formatarValor(transacao.amount)}, estava previsto para ${formatarData(transacao.transaction_date)}. `
      + `Vou marcar como ${verboDaConfirmacao(transacao)} em ${formatarData(data)}${comValor}. Posso confirmar?`;
  }
  const mudancas = campos.map(({ campo, antes, depois }) => {
    const rotulo = ROTULOS_DOS_CAMPOS[campo].toLowerCase();
    return `${rotulo} de ${formatarCampo(campo, antes)} para ${formatarCampo(campo, depois)}`;
  });
  const lista = mudancas.length > 1
    ? `${mudancas.slice(0, -1).join(', ')} e ${mudancas.at(-1)}`
    : mudancas[0];
  return `Vou alterar ${nome} de ${formatarData(transacao.transaction_date)}: ${lista}. Posso confirmar?`;
}

// verbo: o que a pessoa vai fazer com o escolhido ("alterar", "excluir").
export function textoDaEscolha(candidatos, total, { accounts = [], verbo = 'alterar' } = {}) {
  const itens = candidatos.map((transacao, indice) => `${indice + 1}. ${descreverLancamento(transacao, { accounts })}`);
  const abertura = total > candidatos.length
    ? `Encontrei ${total} lançamentos assim. Os ${candidatos.length} mais recentes são:`
    : `Encontrei ${candidatos.length} lançamentos assim:`;
  return `${abertura}\n${itens.join('\n')}\nQual deles você quer ${verbo}?`;
}

export function textoDaAlteracaoFeita(transacao, campos) {
  const nome = transacao.description || 'o lançamento';
  if (confirmaPrevisto(campos)) return `Pronto, marquei ${nome} como ${verboDaConfirmacao(transacao)}.`;
  const mudancas = campos.map(({ campo, depois }) => `${ROTULOS_DOS_CAMPOS[campo].toLowerCase()} ${formatarCampo(campo, depois)}`);
  const lista = mudancas.length > 1
    ? `${mudancas.slice(0, -1).join(', ')} e ${mudancas.at(-1)}`
    : mudancas[0];
  return `Pronto, alterei ${nome}. Agora está com ${lista}.`;
}
