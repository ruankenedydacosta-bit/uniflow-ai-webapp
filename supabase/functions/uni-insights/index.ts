// Edge Function: uni-insights (#122)
//
// Escreve as frases da Leitura do mês da Home com o Claude Haiku 5.5, a partir
// dos números do mês por categoria que o app já calculou. Nunca grava nada.
//
// - Autenticação obrigatória (Bearer + /auth/v1/user), como no uni-interpret.
// - Só números agregados entram no prompt, nunca a descrição dos lançamentos.
// - Leitura com valor que não estava na entrada é descartada (validacao.js).
// - Teto: 10 gerações por dia e o teto mensal de custo por plano (migrations
//   054 e 061). Sem ANTHROPIC_API_KEY → 503 e o app mostra a leitura calculada.
// - Logs só com metadados (motivo, duração, tokens), nunca o texto.
//
// A lógica fica em _shared/uniInsights/*.js, testada com node --test.

import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { LIMITE_DIARIO } from '../_shared/uniInsights/contrato.js';
import { escreverLeituras, gerarComAnthropic } from '../_shared/uniInsights/servico.js';
import { registrarCusto, reservarLeitura } from '../_shared/uniLlmCota.js';

// Abaixo dos 10 s do app (uniInsightsService.js), com folga para a
// autenticação e a reserva da cota. Sem nova tentativa do SDK pelo mesmo motivo.
const TEMPO_LIMITE_MS = 7000;
const MODELO = 'claude-haiku-5-5';

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

function registrarMetrica(status: number, metrica: Record<string, unknown>) {
  console.log(JSON.stringify({ at: 'uni-insights', ts: new Date().toISOString(), status, ...metrica }));
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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const chave = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !chave) {
    return respondJson(503, { error: 'A leitura com IA não está configurada neste ambiente.', motivo: 'sem_cota' });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return respondJson(400, { error: 'Não foi possível ler esta solicitação.', motivo: 'invalido' });
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey).catch(() => null);
  if (!userId) return respondJson(401, { error: 'Entre novamente para usar a Uni.' });

  const cliente = new Anthropic({ apiKey: chave });

  try {
    const resultado = await escreverLeituras({
      corpo,
      reservar: () => reservarLeitura({ supabaseUrl, serviceRoleKey, userId, limiteDiario: LIMITE_DIARIO }),
      chamarModelo: async ({ instrucoes, mensagem }: { instrucoes: string; mensagem: string }) => {
        const chamada = await gerarComAnthropic({
          cliente,
          modelo: MODELO,
          instrucoes,
          mensagem,
          sinal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        });
        // O custo entra depois da resposta, para não somar uma RPC ao tempo
        // que o app espera.
        if (chamada.uso) {
          const custo = registrarCusto({ supabaseUrl, serviceRoleKey, userId, modelo: MODELO, uso: chamada.uso });
          const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (tarefa: Promise<unknown>) => void } }).EdgeRuntime;
          if (runtime?.waitUntil) runtime.waitUntil(custo);
          else await custo;
        }
        return chamada;
      },
    });
    registrarMetrica(resultado.status, resultado.metrica);
    return respondJson(resultado.status, resultado.corpo);
  } catch (erro) {
    registrarMetrica(500, { motivo: 'erro_interno', erro: erro instanceof Error ? erro.message : 'desconhecido' });
    return respondJson(500, { error: 'A Uni não conseguiu escrever a leitura agora.', motivo: 'provedor' });
  }
});
