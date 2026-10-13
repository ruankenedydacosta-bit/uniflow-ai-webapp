// Vocabulário do usuário no prompt da transcrição da conversa por voz (#79).
//
// O modelo de transcrição erra nome próprio ("No Bank" no lugar de
// "Nubank", categoria criada pela pessoa escrita de outro jeito). O prompt
// leva os nomes de contas e categorias do espaço para ele acertar a grafia
// do texto "o que você disse" na tela.
//
// - Os nomes são lidos AQUI, com o JWT do usuário (RLS), nunca aceitos do
//   cliente: a pessoa só influencia o próprio prompt com o que ela vê.
// - Só nomes, nada de saldo, valor ou descrição. A Política de Privacidade
//   já lista "nomes de contas e categorias" no que a OpenAI recebe; metas
//   ficam de fora por isso.
// - Teto de nomes e de caracteres: no gpt-4o-transcribe cada token do
//   prompt é cobrado, e o whisper-1 só lê os últimos 224.
// - Falha ou demora na leitura não derruba a transcrição: ela sai sem prompt.
//
// Sem Deno nem rede fixa: o fetch é injetado, e tudo roda no node --test.

export const MAX_CONTAS_LIDAS = 30;
export const MAX_CATEGORIAS_LIDAS = 60;
export const MAX_NOME_NO_VOCABULARIO = 40;
export const MAX_NOMES_NO_VOCABULARIO = 40;
export const MAX_CARACTERES_DO_VOCABULARIO = 500;
export const TEMPO_LIMITE_DO_VOCABULARIO_MS = 1500;

export const ABERTURA_DO_PROMPT = 'Nomes que podem aparecer na fala: ';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEPARADOR = ', ';

// Modelos que recusam o campo prompt (documentação da OpenAI, 10/2026).
const MODELOS_SEM_PROMPT = new Set(['gpt-4o-transcribe-diarize', 'gpt-realtime-whisper']);

export function modeloAceitaPrompt(modelo) {
  return typeof modelo === 'string' && Boolean(modelo) && !MODELOS_SEM_PROMPT.has(modelo);
}

// Uma linha, sem caractere de controle, sem < > (a OpenAI recusa nos
// keywords), sem aspas e sem vírgula ou ponto e vírgula, que separam os
// nomes. Nome maior que o teto sai inteiro: nome cortado só confunde.
export function limparNome(valor) {
  if (typeof valor !== 'string') return '';
  const limpo = valor
    .replace(/[\p{Cc}<>"“”,;]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo.length > MAX_NOME_NO_VOCABULARIO ? '' : limpo;
}

function chave(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Recebe as listas em ordem de prioridade (contas, depois categorias) e
// devolve os nomes sem repetição, dentro dos tetos.
export function montarVocabulario(listas = []) {
  const vistos = new Set();
  const nomes = [];
  let caracteres = 0;
  for (const lista of listas) {
    if (!Array.isArray(lista)) continue;
    for (const item of lista) {
      if (nomes.length >= MAX_NOMES_NO_VOCABULARIO) return nomes;
      const nome = limparNome(item);
      const chaveDoNome = chave(nome);
      if (!nome || vistos.has(chaveDoNome)) continue;
      const custo = nome.length + (nomes.length ? SEPARADOR.length : 0);
      if (caracteres + custo > MAX_CARACTERES_DO_VOCABULARIO) return nomes;
      vistos.add(chaveDoNome);
      nomes.push(nome);
      caracteres += custo;
    }
  }
  return nomes;
}

export function montarPromptDeTranscricao(nomes = []) {
  if (!Array.isArray(nomes) || nomes.length === 0) return '';
  return `${ABERTURA_DO_PROMPT}${nomes.join(SEPARADOR)}.`;
}

async function lerNomes(caminho, { supabaseUrl, anonKey, authorization, fetchImpl, signal }) {
  const resposta = await fetchImpl(`${supabaseUrl}/rest/v1/${caminho}`, {
    headers: { Authorization: authorization, apikey: anonKey, Accept: 'application/json' },
    signal,
  });
  if (!resposta.ok) return [];
  const linhas = await resposta.json();
  return Array.isArray(linhas) ? linhas.map((linha) => linha?.name) : [];
}

// Lê os nomes do espaço com o JWT do usuário e devolve { nomes, prompt }.
// Qualquer falha devolve vazio: a transcrição segue sem prompt.
export async function carregarVocabularioDoUsuario({
  supabaseUrl,
  anonKey,
  authorization,
  workspaceId,
  fetchImpl = globalThis.fetch,
  tempoLimiteMs = TEMPO_LIMITE_DO_VOCABULARIO_MS,
} = {}) {
  const vazio = { nomes: [], prompt: '' };
  if (
    !supabaseUrl || !anonKey || typeof fetchImpl !== 'function'
    || typeof authorization !== 'string' || !authorization.startsWith('Bearer ')
    || typeof workspaceId !== 'string' || !UUID.test(workspaceId)
  ) {
    return vazio;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), tempoLimiteMs);
  const contexto = { supabaseUrl, anonKey, authorization, fetchImpl, signal: controller.signal };
  try {
    // Só as categorias criadas no espaço: as de sistema têm workspace_id
    // nulo e ficam de fora pelo filtro do espaço. São palavras comuns
    // ("Alimentação", "Transporte") que o modelo já escreve certo.
    const [contas, categorias] = await Promise.all([
      lerNomes(
        `accounts?select=name&workspace_id=eq.${workspaceId}&is_active=eq.true`
          + `&order=name&limit=${MAX_CONTAS_LIDAS}`,
        contexto,
      ),
      lerNomes(
        `categories?select=name&workspace_id=eq.${workspaceId}&is_active=eq.true`
          + `&order=name&limit=${MAX_CATEGORIAS_LIDAS}`,
        contexto,
      ),
    ]);
    const nomes = montarVocabulario([contas, categorias]);
    return { nomes, prompt: montarPromptDeTranscricao(nomes) };
  } catch {
    return vazio;
  } finally {
    clearTimeout(timeout);
  }
}
