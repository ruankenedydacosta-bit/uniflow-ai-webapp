// Cliente da Edge Function uni-interpret (épico #76, sub-issue #78).
//
// A IA lê a frase inteira e escolhe categoria, conta, valor e data entre os
// registros do próprio usuário. O resultado entra no fluxo de lançamento
// como correção dos campos (overrides): o card, a validação e a gravação
// continuam os mesmos. Nunca lança: qualquer falha volta como
// { interpretacao: null, error } e o chat segue com as regras sem IA.

import { normalizeSearchText } from '../../utils/searchText.js';

export const UNI_INTERPRET_FUNCTION_NAME = 'uni-interpret';

// A interpretação fica no meio do lançamento falado: esperar mais que isso
// pesa mais que o ganho de acerto. Mesmo teto da inferência de categoria.
export const UNI_INTERPRET_TIMEOUT_MS = 8000;

const MAX_HISTORICO = 6;

const TIPO_POR_TRANSACAO = Object.freeze({ expense: 'saida', income: 'entrada', transfer: 'transferencia' });
const TRANSACAO_POR_TIPO = Object.freeze({ saida: 'expense', entrada: 'income', transferencia: 'transfer' });

const CODIGO_POR_STATUS = Object.freeze({
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  429: 'RATE_LIMIT',
  503: 'NOT_CONFIGURED',
  504: 'TIMEOUT',
});

export function createUniInterpretClient({
  supabase,
  supabaseUrl,
  supabaseAnonKey,
  enabled = false,
  fetchImpl = globalThis.fetch,
  runtime = globalThis,
  timeoutMs = UNI_INTERPRET_TIMEOUT_MS,
} = {}) {
  function isSupported() {
    return Boolean(enabled && supabase && supabaseUrl && supabaseAnonKey && fetchImpl);
  }

  async function interpretar({ workspaceId, frase, historico = [], rascunho = null } = {}) {
    if (!isSupported()) return { interpretacao: null, error: { code: 'UNSUPPORTED' } };
    if (!workspaceId || typeof frase !== 'string' || !frase.trim()) {
      return { interpretacao: null, error: { code: 'INSUFFICIENT_INPUT' } };
    }

    let accessToken;
    try {
      const sessionResult = await supabase.auth.getSession();
      accessToken = sessionResult?.data?.session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
    if (!accessToken) return { interpretacao: null, error: { code: 'UNAUTHORIZED' } };

    const controller = new AbortController();
    const timeout = runtime.setTimeout?.(() => controller.abort('timeout'), timeoutMs);

    let response;
    try {
      response = await fetchImpl(`${supabaseUrl}/functions/v1/${UNI_INTERPRET_FUNCTION_NAME}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId,
          frase: frase.trim(),
          historico: historico.slice(-MAX_HISTORICO),
          rascunho,
        }),
        signal: controller.signal,
      });
    } catch {
      return { interpretacao: null, error: { code: controller.signal.reason === 'timeout' ? 'TIMEOUT' : 'NETWORK' } };
    } finally {
      runtime.clearTimeout?.(timeout);
    }

    if (!response.ok) {
      return { interpretacao: null, error: { code: CODIGO_POR_STATUS[response.status] ?? 'PROVIDER_ERROR' } };
    }

    try {
      const data = await response.json();
      if (!data || typeof data.intent !== 'string' || !Array.isArray(data.operacoes)) {
        return { interpretacao: null, error: { code: 'INVALID_RESPONSE' } };
      }
      return { interpretacao: data, error: null };
    } catch {
      return { interpretacao: null, error: { code: 'PARSE_ERROR' } };
    }
  }

  return { isSupported, interpretar };
}

// Últimos turnos do chat no formato da função: só texto, sem cards.
export function montarHistoricoParaInterpretacao(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => (message?.from === 'user' || message?.from === 'uni') && typeof message.text === 'string' && message.text.trim())
    .slice(-MAX_HISTORICO)
    .map((message) => ({ autor: message.from === 'uni' ? 'uni' : 'usuario', texto: message.text }));
}

function registroOuNulo(registro) {
  return registro?.id ? { id: registro.id, name: registro.name ?? '' } : null;
}

// Rascunho em aberto no formato que a função devolve, para ela corrigir
// ("não, foi no débito") em vez de começar do zero.
export function montarRascunhoParaInterpretacao(action) {
  const tipo = TIPO_POR_TRANSACAO[action?.transactionType];
  if (!tipo) return null;
  return {
    operacoes: [{
      tipo,
      valor: action.amount ?? null,
      data: action.date ?? null,
      descricao: action.description ?? '',
      categoria: registroOuNulo(action.category),
      novaCategoria: null,
      conta: registroOuNulo(action.account),
      contaDestino: registroOuNulo(action.destinationAccount),
    }],
  };
}

// Interpretação → overrides do fluxo de lançamento. null quando ela não serve
// para este lançamento: outro intent, mais de uma operação (o plano
// financeiro cuida disso) ou tipo diferente do que as regras leram (receita
// contra despesa é decisão grande demais para trocar sem perguntar).
export function interpretacaoParaOverrides(interpretacao, { transactionType } = {}) {
  if (!interpretacao || !['lancamento', 'correcao'].includes(interpretacao.intent)) return null;
  const operacoes = Array.isArray(interpretacao.operacoes) ? interpretacao.operacoes : [];
  if (operacoes.length !== 1) return null;
  const [operacao] = operacoes;
  if (TRANSACAO_POR_TIPO[operacao?.tipo] !== transactionType || transactionType === 'transfer') return null;
  // Parcela não cabe no card de uma operação: o card não pode gravar o
  // total como compra avulsa.
  if (operacao.parcelas) return null;

  const overrides = {};
  if (Number(operacao.valor) > 0) overrides.amount = Number(operacao.valor);
  if (typeof operacao.data === 'string' && operacao.data) overrides.date = operacao.data;
  if (typeof operacao.descricao === 'string' && operacao.descricao.trim()) overrides.description = operacao.descricao.trim();
  if (operacao.categoria?.id) overrides.categoryId = operacao.categoria.id;
  if (operacao.conta?.id) overrides.accountId = operacao.conta.id;
  return Object.keys(overrides).length ? overrides : null;
}

function valorNoRascunho(action, campo) {
  if (campo === 'categoryId') return action?.category?.id ?? null;
  if (campo === 'accountId') return action?.account?.id ?? null;
  return action?.[campo] ?? null;
}

// O modelo devolve a operação inteira: um campo só muda se o valor for outro
// de verdade. Descrição igual sem acento e caixa, ou valor em texto, não é
// mudança.
function mudou(campo, valor, atual) {
  if (campo === 'amount') return Number(valor) !== Number(atual);
  if (campo === 'description') return normalizeSearchText(valor) !== normalizeSearchText(atual ?? '');
  return valor !== atual;
}

// Resposta ao rascunho lida pelo uni-interpret → o que muda nele: os campos
// diferentes do rascunho e, se a pessoa pediu uma categoria fora do
// catálogo, o nome dela. Nome que já existe no catálogo, só com outro acento
// ou caixa, vira a categoria existente, sem card para criar outra. null
// quando a interpretação não corrige este rascunho (outra intenção, outro
// tipo, várias operações, parcela) ou não muda nada: aí as regras leem a
// frase.
export function correcaoDoRascunho(interpretacao, action, { categorias = [] } = {}) {
  if (interpretacao?.intent !== 'correcao') return null;
  const operacoes = Array.isArray(interpretacao.operacoes) ? interpretacao.operacoes : [];
  const [operacao] = operacoes;
  const transactionType = action?.transactionType;
  if (operacoes.length !== 1 || TRANSACAO_POR_TIPO[operacao?.tipo] !== transactionType || transactionType === 'transfer') return null;
  if (operacao.parcelas) return null;

  const overrides = Object.fromEntries(
    Object.entries(interpretacaoParaOverrides(interpretacao, { transactionType }) ?? {})
      .filter(([campo, valor]) => mudou(campo, valor, valorNoRascunho(action, campo))),
  );
  let novaCategoria = !operacao.categoria?.id && typeof operacao.novaCategoria === 'string' && operacao.novaCategoria.trim()
    ? operacao.novaCategoria.trim()
    : null;
  if (novaCategoria) {
    const existente = (Array.isArray(categorias) ? categorias : []).find((categoria) => (
      categoria?.category_type === transactionType
      && categoria.is_active !== false
      && normalizeSearchText(categoria.name) === normalizeSearchText(novaCategoria)
    ));
    if (existente) {
      novaCategoria = null;
      if (existente.id !== valorNoRascunho(action, 'categoryId')) overrides.categoryId = existente.id;
    }
  }
  if (!Object.keys(overrides).length && !novaCategoria) return null;
  return { overrides, novaCategoria };
}
