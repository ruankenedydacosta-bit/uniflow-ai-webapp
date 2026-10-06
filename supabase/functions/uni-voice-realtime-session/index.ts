// Edge Function: uni-voice-realtime-session
//
// Conversa por voz em tempo real com a Uni (OpenAI Realtime por WebRTC).
// Esta função só emite a chave efêmera da sessão: o áudio vai do navegador
// direto para a OpenAI, sem passar por aqui. A OPENAI_API_KEY nunca sai
// deste arquivo; o navegador recebe uma chave que vale para uma sessão.
//
// A conversa não decide nada sobre dinheiro: tudo que envolve lançamentos,
// saldo, contas ou agenda vai pela ferramenta enviar_para_uni ao mesmo
// pipeline do texto, no app (src/features/uni-voice-realtime).
//
// Até a cota de minutos existir (#113), só quem está em
// UNI_REALTIME_ALLOWED_USER_IDS abre sessão. Lista vazia fecha a função para
// todos: a cobrança é por minuto de sessão aberta.

const OPENAI_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';
const DEFAULT_MODEL = 'gpt-realtime-2.1-mini';
const DEFAULT_VOICE = 'marin';
const TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const EAGERNESS_VALUES = new Set(['low', 'medium', 'high', 'auto']);
const DEFAULT_EAGERNESS = 'low';
const DEFAULT_TIMEOUT_MS = 10000;

// Mesma persona de UNI_VOICE_INSTRUCTIONS (uni-voice-tts) e de
// docs/00-master/UNI_PERSONALITY_V1.md, mais as regras de conversa.
const UNI_REALTIME_INSTRUCTIONS = [
  'Você é a Uni, secretária pessoal que cuida das finanças de quem fala com você.',
  'Fale sempre em português do Brasil, com sotaque neutro de São Paulo, como uma brasileira nativa.',
  'Energia alta e natural, com um sorriso que dá para ouvir. Nunca monótona, robótica ou com voz de locutora.',
  'Ritmo de conversa ao telefone com alguém de quem você gosta. Respostas curtas: uma a três frases.',
  'Leia valores, percentuais e datas por extenso, como uma pessoa leria. Nunca soletre dígitos.',
  'Pronuncie à brasileira marcas e bancos usados no Brasil, como Pix, Nubank, Itaú, iFood e Mercado Pago.',
  'Se a pessoa pausar no meio de uma frase, espere ela terminar. Não complete a frase por ela.',
  'Se for interrompida, pare e responda ao que a pessoa acabou de dizer.',
  'Tudo que envolve dinheiro ou compromissos passa pela ferramenta enviar_para_uni: registrar gasto, receita ou transferência, consultar saldo, gastos ou contas, mexer na agenda, e responder a um rascunho (confirmar, corrigir ou cancelar). Passe a frase da pessoa como ela disse, sem resumir nem completar.',
  'Depois da ferramenta, fale a resposta dela com naturalidade e em poucas palavras. Não acrescente valores, datas, categorias nem contas que não estejam na resposta.',
  'Se a resposta disser que há um rascunho aguardando confirmação, pergunte se pode confirmar. A pessoa também pode confirmar tocando no card da tela.',
  'Você não sabe nada sobre as finanças da pessoa além do que a ferramenta devolve. Nunca invente valores.',
  'Para conversa que não envolve dinheiro nem agenda, responda direto, sem a ferramenta.',
  'Nada de risadas, gritos, voz infantil ou exagero teatral.',
].join('\n');

function getAllowedOrigins() {
  return new Set(
    (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  if (getAllowedOrigins().has(origin)) return true;
  return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function corsHeaders(origin: string) {
  return {
    ...(origin ? {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(status: number, body: Record<string, unknown>, origin: string = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: string, message: string, origin: string = '') {
  return jsonResponse(status, { error: { code, message } }, origin);
}

function readAllowlist(value = '') {
  return new Set(value.split(',').map((id) => id.trim()).filter(Boolean));
}

async function getAuthenticatedUserId(authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// O nome e os parâmetros precisam bater com
// src/features/uni-voice-realtime/realtimeToolBridge.js.
const SEND_TO_UNI_TOOL = {
  type: 'function',
  name: 'enviar_para_uni',
  description: 'Envia a frase da pessoa ao assistente financeiro da Uni, que registra lançamentos, consulta saldo, gastos e contas, cuida da agenda e confirma ou cancela rascunhos. Devolve a resposta a ser falada e se há rascunho aguardando confirmação.',
  parameters: {
    type: 'object',
    properties: {
      frase: {
        type: 'string',
        description: 'O que a pessoa disse, com as palavras dela.',
      },
    },
    required: ['frase'],
  },
};

function buildSessionConfig({ model, voice, eagerness }: { model: string; voice: string; eagerness: string }) {
  return {
    session: {
      type: 'realtime',
      model,
      instructions: UNI_REALTIME_INSTRUCTIONS,
      tools: [SEND_TO_UNI_TOOL],
      tool_choice: 'auto',
      audio: {
        input: {
          noise_reduction: { type: 'near_field' },
          transcription: { model: TRANSCRIPTION_MODEL, language: 'pt' },
          // semantic_vad decide o fim da fala pelo sentido do que foi dito,
          // não só pelo silêncio. interrupt_response deixa a pessoa cortar a
          // Uni; o eco da própria Uni é tirado antes, no navegador.
          turn_detection: {
            type: 'semantic_vad',
            eagerness,
            create_response: true,
            interrupt_response: true,
          },
        },
        output: { voice },
      },
    },
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? '';
  if (!isAllowedOrigin(origin)) {
    return errorResponse(403, 'ORIGIN_NOT_ALLOWED', 'Origem não autorizada.');
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.', origin);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return errorResponse(401, 'UNAUTHORIZED', 'Entre no app para conversar com a Uni.', origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const providerKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  const model = Deno.env.get('OPENAI_REALTIME_MODEL') || DEFAULT_MODEL;
  const voice = Deno.env.get('OPENAI_REALTIME_VOICE') || DEFAULT_VOICE;
  const timeoutMs = Number(Deno.env.get('UNI_REALTIME_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;
  const allowlist = readAllowlist(Deno.env.get('UNI_REALTIME_ALLOWED_USER_IDS'));

  if (!supabaseUrl || !anonKey || !providerKey) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !anonKey && 'SUPABASE_ANON_KEY',
      !providerKey && 'OPENAI_API_KEY',
    ].filter(Boolean);
    console.warn('uni_voice_realtime_configuration_error', { missing });
    return errorResponse(503, 'CONFIGURATION_ERROR', 'A conversa contínua não está configurada neste ambiente.', origin);
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return errorResponse(401, 'UNAUTHORIZED', 'Entre no app para conversar com a Uni.', origin);
  if (!allowlist.has(userId)) {
    return errorResponse(403, 'NOT_ALLOWED', 'A conversa contínua ainda está em teste e não foi liberada para esta conta.', origin);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    // Corpo vazio é aceito: todos os campos têm padrão.
  }
  const eagerness = typeof payload?.eagerness === 'string' && EAGERNESS_VALUES.has(payload.eagerness)
    ? payload.eagerness
    : DEFAULT_EAGERNESS;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
  let providerResponse: Response;
  try {
    providerResponse = await fetch(OPENAI_CLIENT_SECRETS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerKey}`,
        'Content-Type': 'application/json',
        // Identifica o usuário para a OpenAI sem expor o id: só o hash.
        'OpenAI-Safety-Identifier': await sha256Hex(userId),
      },
      body: JSON.stringify(buildSessionConfig({ model, voice, eagerness })),
      signal: controller.signal,
    });
  } catch {
    console.warn('uni_voice_realtime_provider_unreachable', { timeout: controller.signal.aborted });
    return errorResponse(502, 'PROVIDER_UNAVAILABLE', 'Não foi possível abrir a conversa agora. Tente de novo em instantes.', origin);
  } finally {
    clearTimeout(timeout);
  }

  const data = await providerResponse.json().catch(() => null);
  if (!providerResponse.ok || typeof data?.value !== 'string') {
    // Protótipo: a mensagem do provedor vai para o log para acertar o
    // formato da sessão. Nunca a chave.
    console.warn('uni_voice_realtime_provider_error', {
      status: providerResponse.status,
      code: data?.error?.code ?? null,
      message: data?.error?.message ?? null,
    });
    return errorResponse(502, 'PROVIDER_ERROR', 'Não foi possível abrir a conversa agora. Tente de novo em instantes.', origin);
  }

  return jsonResponse(200, {
    client_secret: data.value,
    expires_at: data.expires_at ?? null,
    model,
    voice,
    eagerness,
  }, origin);
});
