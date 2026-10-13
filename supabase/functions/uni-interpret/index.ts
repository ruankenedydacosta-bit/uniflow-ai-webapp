// Edge Function: uni-interpret (épico #104, F1)
//
// Interpreta uma frase do usuário (voz transcrita ou texto) e devolve uma
// proposta de lançamento validada para o card de confirmação. Nunca grava:
// quem grava é a RPC execute_confirmed_financial_action, depois do clique.
//
// - Autenticação obrigatória (Bearer + /auth/v1/user), como no uni-chat-llm.
// - Catálogo e contas são lidos AQUI, com o JWT do próprio usuário (RLS),
//   nunca aceitos do cliente: o modelo só escolhe entre o que o usuário vê.
// - Sem OPENAI_API_KEY → 503 e o frontend cai no rascunho sem IA.
// - Logs só com metadados (modelo, duração, motivo, tokens), nunca a frase.
//
// A lógica fica em _shared/uniInterpret/*.js, testada com node --test.

import { interpretarFrase } from '../_shared/uniInterpret/servico.js';
import { interpretarComOpenAi } from '../_shared/uniInterpret/provedores.js';
import { registrarCusto, reservarChamada } from '../_shared/uniLlmCota.js';

const TEMPO_LIMITE_MS = 15000;
const MAX_CATEGORIAS = 200;
const MAX_CONTAS = 60;
const MAX_METAS = 40;
// Memórias de categoria lidas por chamada (#79). O prompt usa até 30: as que
// dividem palavra com a frase primeiro, depois as mais recentes.
const MAX_MEMORIAS_LIDAS = 200;

function getAllowedOrigins() {
  return (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string) {
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
}

function corsHeaders(origin: string) {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(status: number, body: Record<string, unknown>, origin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

async function getAuthenticatedUserId(authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

// PostgREST com o JWT do usuário: a RLS decide o que ele enxerga.
async function lerComoUsuario(path: string, authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { Authorization: authorization, apikey: anonKey, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`postgrest_${response.status}`);
  return await response.json();
}

// As cinco leituras saem juntas (são a latência antes do modelo, no caminho
// da voz). applies_to é filtrado depois, quando o tipo do workspace já é
// conhecido. Categorias de sistema vêm primeiro, para o limite nunca cortar
// as genéricas ("Outras despesas", "Transferência"). Categoria oculta no
// espaço (#184) sai da lista: o modelo não sugere o que a pessoa escondeu.
// Metas: só as que a tela Metas mostra em aberto (ativas e pausadas), para
// a pessoa apontar qual. Memórias de categoria (#79): a RLS só devolve as da
// própria pessoa neste espaço; falha aqui só tira as memórias do prompt.
function criarCarregadorDeContexto(authorization: string, supabaseUrl: string, anonKey: string) {
  return async (workspaceId: string) => {
    const ler = (path: string) => lerComoUsuario(path, authorization, supabaseUrl, anonKey);
    const [workspaces, todasCategorias, ocultas, contas, metas, memorias] = await Promise.all([
      ler(`workspaces?select=workspace_type&id=eq.${workspaceId}&limit=1`),
      ler(
        'categories?select=id,name,category_type,applies_to&is_active=eq.true'
          + `&or=(workspace_id.is.null,workspace_id.eq.${workspaceId})`
          + `&order=is_system.desc,name&limit=${MAX_CATEGORIAS}`,
      ),
      // Falha aqui não derruba a interpretação: sem a lista, nenhuma
      // categoria é tirada (ex.: função publicada antes da migration 067).
      ler(`workspace_hidden_categories?select=category_id&workspace_id=eq.${workspaceId}`).catch(() => []),
      ler(`accounts?select=id,name&workspace_id=eq.${workspaceId}&is_active=eq.true&order=name&limit=${MAX_CONTAS}`),
      ler(
        `financial_goals?select=id,name&workspace_id=eq.${workspaceId}&archived_at=is.null`
          + `&status=in.(active,paused)&order=name&limit=${MAX_METAS}`,
      ),
      ler(
        // Só os dois campos do valor: os eventos guardados ficam no banco.
        'uni_financial_memories?select=descricao:memory_value->>descricao,categoria_id:memory_value->>categoria_id'
          + `&workspace_id=eq.${workspaceId}`
          + '&memory_type=eq.merchant_category_mapping&status=in.(candidate,confirmed)'
          + `&order=last_observed_at.desc&limit=${MAX_MEMORIAS_LIDAS}`,
      ).catch(() => []),
    ]);
    const workspaceType = workspaces?.[0]?.workspace_type;
    if (workspaceType !== 'personal' && workspaceType !== 'business') return null;

    const idsOcultos = new Set(
      (ocultas as Array<Record<string, string>>).map((linha) => linha.category_id),
    );
    const categorias = (todasCategorias as Array<Record<string, string>>)
      .filter((categoria) => categoria.applies_to === 'both' || categoria.applies_to === workspaceType)
      .filter((categoria) => !idsOcultos.has(categoria.id))
      .map(({ id, name, category_type }) => ({ id, name, category_type }));
    const memoriasDeCategoria = (memorias as Array<{ descricao?: unknown; categoria_id?: unknown }>)
      .filter((memoria) => typeof memoria.descricao === 'string' && typeof memoria.categoria_id === 'string');
    return { workspaceType, categorias, contas, metas, memorias: memoriasDeCategoria };
  };
}

// UNI_INTERPRET_TEMPERATURE ausente → parâmetro omitido (a família gpt-5.6
// só aceita o padrão).
function temperaturaConfigurada() {
  const valor = Deno.env.get('UNI_INTERPRET_TEMPERATURE');
  if (valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

class NaoAutenticado extends Error {}

function registrarMetrica(status: number, metrica: Record<string, unknown>) {
  console.log(JSON.stringify({ at: 'uni-interpret', ts: new Date().toISOString(), status, ...metrica }));
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? '';
  if (!isAllowedOrigin(origin)) {
    return jsonResponse(403, { error: 'Origem não autorizada.' });
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  const respondJson = (status: number, body: Record<string, unknown>) => jsonResponse(status, body, origin);
  if (request.method !== 'POST') return respondJson(405, { error: 'Método não permitido.' });

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return respondJson(401, { error: 'Entre novamente para usar a Uni.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const chave = Deno.env.get('OPENAI_API_KEY') ?? '';
  const modelo = Deno.env.get('UNI_INTERPRET_MODEL') ?? 'gpt-5.6-luna';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !chave) {
    return respondJson(503, { error: 'A interpretação por IA não está configurada neste ambiente.' });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return respondJson(400, { error: 'Não foi possível ler esta solicitação.' });
  }

  // A checagem do usuário corre junto com a leitura do catálogo; o modelo só
  // é chamado depois que as duas terminam.
  const usuario = getAuthenticatedUserId(authorization, supabaseUrl, anonKey).catch(() => null);
  const carregarContexto = criarCarregadorDeContexto(authorization, supabaseUrl, anonKey);

  try {
    const resultado = await interpretarFrase({
      corpo,
      carregarContexto: async (workspaceId: string) => {
        const [userId, contexto] = await Promise.all([usuario, carregarContexto(workspaceId)]);
        if (!userId) throw new NaoAutenticado();
        return contexto;
      },
      // Conta só o que vai mesmo chamar a OpenAI: pedido inválido ou sem
      // acesso ao espaço não gasta o teto.
      chamarModelo: async ({ instrucoes, mensagem }: { instrucoes: string; mensagem: string }) => {
        // Teto por plano (migration 054), o mesmo da uni-chat-llm.
        const userId = await usuario;
        const chamadaDoDia = await reservarChamada({ supabaseUrl, serviceRoleKey, userId });
        if (chamadaDoDia === 'teto_diario' || chamadaDoDia === 'teto_mensal') return { ok: false, motivo: 'limite', modelo };
        if (chamadaDoDia === 'indisponivel') return { ok: false, motivo: 'sem_cota', modelo };
        const chamada = await interpretarComOpenAi({
          chave,
          modelo,
          instrucoes,
          mensagem,
          temperatura: temperaturaConfigurada(),
          sinal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        });
        if (chamada.uso) await registrarCusto({ supabaseUrl, serviceRoleKey, userId, modelo, uso: chamada.uso });
        return chamada;
      },
    });
    registrarMetrica(resultado.status, resultado.metrica);
    return respondJson(resultado.status, resultado.corpo);
  } catch (erro) {
    if (erro instanceof NaoAutenticado || (await usuario) === null) {
      return respondJson(401, { error: 'Entre novamente para usar a Uni.' });
    }
    registrarMetrica(500, { motivo: 'erro_interno', erro: erro instanceof Error ? erro.message : 'desconhecido' });
    return respondJson(500, { error: 'A Uni não conseguiu interpretar agora.' });
  }
});
