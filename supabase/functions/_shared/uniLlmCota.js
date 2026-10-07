// Teto de IA por plano (migration 054), usado pela uni-chat-llm e pela
// uni-interpret. Antes de chamar a OpenAI, reserva a chamada
// (uni_llm_reserve_call); depois, soma o custo real dos tokens ao dia
// (uni_llm_record_cost).
//
// JS puro: a Edge Function (Deno) e os testes (node --test) importam o mesmo
// arquivo.

// US$ por milhão de tokens. Modelo fora da tabela é cobrado pelo mais caro,
// para o teto nunca ficar frouxo por um modelo novo configurado no secret.
export const PRECOS_POR_MILHAO_USD = Object.freeze({
  'gpt-5.6-luna': { entrada: 0.2, saida: 1.2 },
  'gpt-5.4-mini': { entrada: 0.75, saida: 4.5 },
});
const PRECO_DESCONHECIDO = Object.freeze({ entrada: 2.5, saida: 15 });

// Mesmo câmbio da proposta de planos.
export const CAMBIO_BRL = 5.5;

export function custoEmReais(modelo, { entrada = 0, saida = 0 } = {}) {
  const preco = PRECOS_POR_MILHAO_USD[modelo] ?? PRECO_DESCONHECIDO;
  const tokensEntrada = Number.isFinite(entrada) && entrada > 0 ? entrada : 0;
  const tokensSaida = Number.isFinite(saida) && saida > 0 ? saida : 0;
  const usd = (tokensEntrada * preco.entrada + tokensSaida * preco.saida) / 1_000_000;
  return Math.round(usd * CAMBIO_BRL * 10_000) / 10_000;
}

function chamarRpc(fetchImpl, supabaseUrl, serviceRoleKey, nome, corpo) {
  return fetchImpl(`${supabaseUrl}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });
}

// 'liberada', 'teto_diario', 'teto_mensal' ou 'indisponivel'. Falha fechado:
// sem conseguir contar, não chama a OpenAI e o app segue sem IA.
export async function reservarChamada({ fetchImpl = globalThis.fetch, supabaseUrl, serviceRoleKey, userId }) {
  if (!serviceRoleKey || !supabaseUrl || !userId) return 'indisponivel';
  try {
    const response = await chamarRpc(fetchImpl, supabaseUrl, serviceRoleKey, 'uni_llm_reserve_call', { p_user_id: userId });
    if (!response.ok) return 'indisponivel';
    const linhas = await response.json();
    const linha = Array.isArray(linhas) ? linhas[0] : linhas;
    if (typeof linha?.allowed !== 'boolean') return 'indisponivel';
    if (linha.allowed) return 'liberada';
    return linha.reason === 'monthly_ceiling' ? 'teto_mensal' : 'teto_diario';
  } catch {
    return 'indisponivel';
  }
}

// Nunca lança: a resposta já foi gerada e não depende disto. Custo zero não
// escreve nada.
export async function registrarCusto({ fetchImpl = globalThis.fetch, supabaseUrl, serviceRoleKey, userId, modelo, uso }) {
  const custo = custoEmReais(modelo, uso);
  if (!custo || !serviceRoleKey || !supabaseUrl || !userId) return false;
  try {
    const response = await chamarRpc(fetchImpl, supabaseUrl, serviceRoleKey, 'uni_llm_record_cost', {
      p_user_id: userId,
      p_cost_brl: custo,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const MENSAGEM_TETO = Object.freeze({
  teto_diario: 'Você chegou ao limite de respostas da Uni por hoje. Amanhã o limite volta.',
  teto_mensal: 'Você chegou ao limite de respostas da Uni deste mês. O limite volta no próximo mês.',
});
