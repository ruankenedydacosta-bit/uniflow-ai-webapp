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
// Antes de emitir a chave, reserva um bloco de minutos do plano
// (voice_reserve_block). Sem saldo ou sem assinatura, responde 403 com
// fallback 'text' e o app abre a conversa por texto. A chave vale 60 s: só
// abre a conversa dentro da reserva que acabou de ser feita.
//
// Enquanto a liberação geral não sai (#113), só quem está em
// UNI_REALTIME_ALLOWED_USER_IDS abre sessão. Lista vazia fecha a função.

import {
  mapVoiceReserveError,
  parseVoiceReservation,
  type VoiceReservation,
} from '../_shared/voiceQuotaRules.ts';

const OPENAI_CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';
const DEFAULT_MODEL = 'gpt-realtime-2.1-mini';
const DEFAULT_VOICE = 'marin';
const TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';
const EAGERNESS_VALUES = new Set(['low', 'medium', 'high', 'auto']);
const DEFAULT_EAGERNESS = 'low';
const DEFAULT_TIMEOUT_MS = 10000;
const CLIENT_SECRET_TTL_SECONDS = 60;

// Mesma persona de UNI_VOICE_INSTRUCTIONS (uni-voice-tts) e de
// docs/00-master/UNI_PERSONALITY_V1.md, mais as regras de conversa.
const UNI_REALTIME_INSTRUCTIONS = [
  'Você é a Uni, secretária pessoal que cuida das finanças de quem fala com você.',
  'Fale sempre em português do Brasil, com sotaque neutro de São Paulo, como uma brasileira nativa.',
  'Energia alta e natural, com um sorriso que dá para ouvir. Nunca monótona, robótica ou com voz de locutora.',
  'Ritmo de conversa ao telefone com alguém de quem você gosta. Seja objetiva: uma frase, no máximo duas. Vá direto ao ponto, sem rodeio e sem repetir o que a pessoa acabou de dizer.',
  'Não ofereça ajuda extra nem termine com "quer mais alguma coisa?". A pessoa fala quando quiser.',
  'Leia valores, percentuais e datas por extenso, como uma pessoa leria. Nunca soletre dígitos.',
  'Pronuncie à brasileira marcas e bancos usados no Brasil, como Pix, Nubank, Itaú, iFood e Mercado Pago.',
  'Se a pessoa pausar no meio de uma frase, espere ela terminar. Não complete a frase por ela.',
  'Se for interrompida, pare e responda ao que a pessoa acabou de dizer.',
  'Tudo que envolve dinheiro ou compromissos passa pela ferramenta enviar_para_uni: registrar gasto, receita ou transferência, consultar saldo, gastos ou contas, mexer na agenda, corrigir um rascunho e alterar um lançamento já registrado. Passe a frase da pessoa como ela disse, sem resumir nem completar.',
  'Para alterar um lançamento já registrado, como "corrige o mercado de ontem pra cinquenta" ou "o Uber de segunda foi no Nubank", passe a frase com enviar_para_uni. Se a Uni listar vários lançamentos e perguntar qual, passe a resposta da pessoa com enviar_para_uni.',
  'Com um rascunho ou uma alteração aguardando confirmação, quando a pessoa aceitar com qualquer palavra, como "manda ver", "fechou" ou "uhum, pode", chame responder_rascunho com acao confirmar. Se ela desistir do rascunho, use cancelar. Se desistir de tudo, inclusive da conta ou categoria que seria criada, use cancelar_tudo.',
  'Só confirme quando a pessoa aceitar com clareza. Se a resposta for ambígua, pergunte antes.',
  'Para mudar valor, conta, categoria, data ou descrição do rascunho, passe a frase com enviar_para_uni. Se a pessoa só disser que quer editar, pergunte o que ela quer mudar.',
  'Depois da ferramenta, fale só o essencial da resposta, em uma frase. Pule o que a pessoa já sabe e perguntas de fechamento como "quer que eu faça mais alguma coisa?". Se a resposta listar opções para a pessoa escolher, como os lançamentos encontrados, diga todas. Não acrescente valores, datas, categorias nem contas que não estejam na resposta.',
  'Se a resposta disser que há um rascunho aguardando confirmação, diga o valor, o que é e a conta, e pergunte se pode confirmar. Se for a alteração de um lançamento já registrado, diga o campo que muda, como estava e como fica, e pergunte se pode confirmar. O resto está no card da tela: só leia se a pessoa pedir.',
  'Você não sabe nada sobre as finanças da pessoa além do que a ferramenta devolve. Nunca invente valores.',
  'Para conversa que não envolve dinheiro nem agenda, responda direto, sem a ferramenta.',
  'Se a pessoa corrigir como se fala o nome dela, chame salvar_pronuncia_do_nome com a pronúncia certa e, daí em diante, diga o nome só desse jeito.',
  'Quando a pessoa pedir para encerrar, desligar ou terminar a conversa, com quaisquer palavras, chame encerrar_conversa. Um "tchau" no meio de outra frase não basta: só chame quando ela quiser mesmo parar de falar.',
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
  description: 'Envia a frase da pessoa ao assistente financeiro da Uni, que registra e altera lançamentos, consulta saldo, gastos e contas, cuida da agenda e corrige rascunhos. Devolve a resposta a ser falada e se há rascunho aguardando confirmação.',
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

// O nome e os parâmetros precisam bater com
// src/features/uni-voice-realtime/realtimeToolBridge.js. Quem grava é o app,
// no perfil da pessoa; a próxima conversa já nasce com a pronúncia.
const SAVE_NAME_PRONUNCIATION_TOOL = {
  type: 'function',
  name: 'salvar_pronuncia_do_nome',
  description: 'Guarda como se fala o nome da pessoa, para todas as conversas seguintes. Use quando a pessoa corrigir a pronúncia do nome dela.',
  parameters: {
    type: 'object',
    properties: {
      pronuncia: {
        type: 'string',
        description: 'Como o nome soa, escrito do jeito que se lê em português, com as sílabas separadas por hífen e a sílaba forte em maiúsculas. Ex.: jo-NA-tas.',
      },
    },
    required: ['pronuncia'],
  },
};

// O nome e os valores de acao precisam bater com REALTIME_DRAFT_REPLIES em
// src/features/uni-voice-realtime/realtimeToolBridge.js. O app só aceita a
// chamada com um card esperando confirmação.
const ANSWER_DRAFT_TOOL = {
  type: 'function',
  name: 'responder_rascunho',
  description: 'Confirma ou cancela o rascunho ou a alteração de lançamento que está aguardando confirmação na tela, como se a pessoa tocasse no card. Use quando a pessoa aceitar ou recusar o rascunho, com quaisquer palavras. Devolve a resposta a ser falada.',
  parameters: {
    type: 'object',
    properties: {
      acao: {
        type: 'string',
        enum: ['confirmar', 'cancelar', 'cancelar_tudo'],
        description: 'confirmar grava o rascunho ou a alteração. cancelar descarta o rascunho ou a alteração. cancelar_tudo descarta também a conta ou categoria que seria criada para ele.',
      },
    },
    required: ['acao'],
  },
};

// O nome precisa bater com src/features/uni-voice-realtime/realtimeToolBridge.js.
// Quem encerra é o app, depois de a Uni se despedir.
const END_CONVERSATION_TOOL = {
  type: 'function',
  name: 'encerrar_conversa',
  description: 'Encerra a conversa por voz, como se a pessoa tocasse em Parar. Use quando a pessoa pedir para desligar, encerrar ou terminar a conversa. Depois, despeça-se em uma frase curta.',
  parameters: { type: 'object', properties: {} },
};

const MAX_NAME_LENGTH = 60;

// Texto que vem do perfil entra nas instruções: uma linha, sem aspas, curto.
function sanitizeProfileText(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/[\p{Cc}"]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
    : '';
}

// Mesma regra de resolveUserDisplayName (src/features/simplified-app/simplifiedGreeting.js):
// o nome preferido ou o primeiro nome.
function resolveProfileName(profile: Record<string, unknown> | null) {
  return sanitizeProfileText(profile?.preferred_name)
    || sanitizeProfileText(profile?.full_name).split(' ')[0]
    || '';
}

function buildNameInstructions(profile: Record<string, unknown> | null) {
  const name = resolveProfileName(profile);
  if (!name) return '';
  const pronunciation = sanitizeProfileText(profile?.name_pronunciation);
  if (!pronunciation) return `O nome da pessoa é ${name}.`;
  return `O nome da pessoa é ${name} e se pronuncia assim: ${pronunciation}. Sempre que disser o nome, use essa pronúncia.`;
}

// Sem perfil legível, a conversa abre sem o nome: não vale perder a sessão
// por isso.
async function fetchProfileForVoice(supabaseUrl: string, serviceRoleKey: string, userId: string) {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=preferred_name,full_name,name_pronunciation`,
      { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
    );
    if (!response.ok) {
      console.warn('uni_voice_realtime_profile_unavailable', { status: response.status });
      return null;
    }
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch {
    console.warn('uni_voice_realtime_profile_unavailable', { status: null });
    return null;
  }
}

function buildSessionConfig({ model, voice, eagerness, nameInstructions }: {
  model: string;
  voice: string;
  eagerness: string;
  nameInstructions: string;
}) {
  return {
    expires_after: { anchor: 'created_at', seconds: CLIENT_SECRET_TTL_SECONDS },
    session: {
      type: 'realtime',
      model,
      instructions: nameInstructions ? `${UNI_REALTIME_INSTRUCTIONS}\n${nameInstructions}` : UNI_REALTIME_INSTRUCTIONS,
      tools: [SEND_TO_UNI_TOOL, SAVE_NAME_PRONUNCIATION_TOOL, ANSWER_DRAFT_TOOL, END_CONVERSATION_TOOL],
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

async function callVoiceRpc(supabaseUrl: string, serviceRoleKey: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, body };
}

// A OpenAI recusou a sessão depois da reserva: devolve os minutos.
async function releaseReservation(supabaseUrl: string, serviceRoleKey: string, reservation: VoiceReservation) {
  const result = await callVoiceRpc(supabaseUrl, serviceRoleKey, 'voice_release_failed', {
    p_session_id: reservation.sessionId,
  });
  if (!result.ok) console.warn('uni_voice_realtime_release_failed');
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
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const providerKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  const model = Deno.env.get('OPENAI_REALTIME_MODEL') || DEFAULT_MODEL;
  const voice = Deno.env.get('OPENAI_REALTIME_VOICE') || DEFAULT_VOICE;
  const timeoutMs = Number(Deno.env.get('UNI_REALTIME_TIMEOUT_MS')) || DEFAULT_TIMEOUT_MS;
  const allowlist = readAllowlist(Deno.env.get('UNI_REALTIME_ALLOWED_USER_IDS'));

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !providerKey) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !anonKey && 'SUPABASE_ANON_KEY',
      !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
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

  const nameInstructions = buildNameInstructions(await fetchProfileForVoice(supabaseUrl, serviceRoleKey, userId));

  // Reserva antes de qualquer chamada paga. O saldo e a assinatura são
  // conferidos pelo banco; o app só fica sabendo o resultado.
  const reserve = await callVoiceRpc(supabaseUrl, serviceRoleKey, 'voice_reserve_block', { p_user_id: userId });
  const reservation = reserve.ok ? parseVoiceReservation(reserve.body) : null;
  if (!reservation) {
    const refusal = mapVoiceReserveError(reserve.body);
    if (refusal.status >= 500) console.warn('uni_voice_realtime_reserve_failed', { code: refusal.code });
    return jsonResponse(refusal.status, {
      error: { code: refusal.code, message: refusal.message },
      fallback: refusal.fallback,
    }, origin);
  }

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
      body: JSON.stringify(buildSessionConfig({ model, voice, eagerness, nameInstructions })),
      signal: controller.signal,
    });
  } catch {
    console.warn('uni_voice_realtime_provider_unreachable', { timeout: controller.signal.aborted });
    await releaseReservation(supabaseUrl, serviceRoleKey, reservation);
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
    await releaseReservation(supabaseUrl, serviceRoleKey, reservation);
    return errorResponse(502, 'PROVIDER_ERROR', 'Não foi possível abrir a conversa agora. Tente de novo em instantes.', origin);
  }

  return jsonResponse(200, {
    client_secret: data.value,
    expires_at: data.expires_at ?? null,
    model,
    voice,
    eagerness,
    voice_session_id: reservation.sessionId,
    reserved_seconds: reservation.reservedSeconds,
    reserved_until: reservation.expiresAt,
    remaining_seconds: reservation.remainingSeconds,
  }, origin);
});
