import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const EDGE_SOURCE = readFileSync(
  new URL('../../../supabase/functions/uni-voice-tts/index.ts', import.meta.url),
  'utf8',
);
const MIGRATION_SOURCE = readFileSync(
  new URL('../../../supabase/migrations/20260725002100_021_uni_voice_cache.sql', import.meta.url),
  'utf8',
);

// ============================================================================
// ELEVEN2.1 -- cache persistente de audio TTS. Cobertura estrutural
// (source-regex) da migration e da Edge Function, mesmo padrao ja usado por
// uniVoiceTts.test.js (ELEVEN1/2) e notificationsMigration.test.js (NOTIF1).
// ============================================================================

// ----------------------------------------------------------------------------
// Migration: tabela de metadados, unicidade, RLS, bucket privado
// ----------------------------------------------------------------------------

test('tabela uni_voice_cache tem as colunas minimas exigidas, sem armazenar texto integral nem API key', () => {
  for (const column of [
    'id', 'user_id', 'cache_key', 'storage_path', 'voice_id_hash',
    'model_id', 'output_format', 'character_count', 'created_at',
    'last_accessed_at', 'expires_at',
  ]) {
    assert.match(MIGRATION_SOURCE, new RegExp(`\\b${column}\\b`), `coluna ${column} ausente`);
  }
  assert.doesNotMatch(MIGRATION_SOURCE, /\btext\b.*column|full_text|message_text|api_key\s+text/i);
});

test('unique index por (user_id, cache_key) -- concorrencia converge numa unica linha, nunca duplicidade permanente', () => {
  assert.match(
    MIGRATION_SOURCE,
    /create unique index uni_voice_cache_user_key_uidx\s*\n\s*on public\.uni_voice_cache \(user_id, cache_key\);/,
  );
});

test('RLS habilitado, usuario so le os proprios registros -- nenhuma leitura cruzada, sem insert/update/delete para authenticated', () => {
  assert.match(MIGRATION_SOURCE, /alter table public\.uni_voice_cache enable row level security;/);
  assert.match(
    MIGRATION_SOURCE,
    /create policy uni_voice_cache_select_own\s*\n\s*on public\.uni_voice_cache\s*\n\s*for select\s*\n\s*to authenticated\s*\n\s*using \(\(select auth\.uid\(\)\) = user_id\);/,
  );
  assert.doesNotMatch(MIGRATION_SOURCE, /for insert\s*\n\s*to authenticated|for update\s*\n\s*to authenticated|for delete/);
  assert.match(MIGRATION_SOURCE, /grant select on table public\.uni_voice_cache to authenticated;/);
});

test('bucket uni-voice-cache criado como privado (public: false), nunca publico', () => {
  assert.match(
    MIGRATION_SOURCE,
    /insert into storage\.buckets \(id, name, public\)\s*\n\s*values \('uni-voice-cache', 'uni-voice-cache', false\)/,
  );
});

test('policy de storage restringe cada usuario a propria pasta (prefixo user_id no caminho)', () => {
  assert.match(
    MIGRATION_SOURCE,
    /create policy uni_voice_cache_storage_select_own\s*\n\s*on storage\.objects/,
  );
  assert.match(MIGRATION_SOURCE, /\(select auth\.uid\(\)\)::text = \(storage\.foldername\(name\)\)\[1\]/);
});

test('migration nao altera nenhuma migration antiga -- e um arquivo novo e independente', () => {
  assert.match(MIGRATION_SOURCE.trim(), /^begin;/);
  assert.match(MIGRATION_SOURCE.trim(), /commit;$/);
});

// ----------------------------------------------------------------------------
// Edge Function: chave de cache, fluxo HIT/MISS, seguranca, degradacao
// ----------------------------------------------------------------------------

test('chave de cache e SHA-256 determinístico incluindo texto sanitizado, user_id, voice, modelo, formato e versao do algoritmo', () => {
  assert.match(EDGE_SOURCE, /async function computeCacheKey/);
  assert.match(EDGE_SOURCE, /sha256Hex\(`\$\{CACHE_ALGO_VERSION\}:\$\{userId\}:\$\{voiceId\}:\$\{modelId\}:\$\{outputFormat\}:\$\{text\}`\)/);
  assert.match(EDGE_SOURCE, /const CACHE_ALGO_VERSION = 'v1';/);
});

test('cache key usa crypto.subtle.digest (SHA-256 nativo), nunca uma lib externa nem o texto puro como caminho', () => {
  assert.match(EDGE_SOURCE, /crypto\.subtle\.digest\('SHA-256'/);
  assert.doesNotMatch(EDGE_SOURCE, /storage_path.*=.*text\b/);
});

test('caminho de storage usa apenas <user_id>/<cache_hash>.mp3 -- nunca nome, e-mail, CPF ou texto no path', () => {
  assert.match(EDGE_SOURCE, /const storagePath = `\$\{userId\}\/\$\{cacheKey\}\.mp3`;/);
});

test('voice_id nunca e armazenado em claro na tabela -- so um hash SHA-256 dele', () => {
  const fnBody = EDGE_SOURCE.slice(EDGE_SOURCE.indexOf('const voiceIdHash = await sha256Hex(voiceId);'));
  assert.match(fnBody, /const voiceIdHash = await sha256Hex\(voiceId\);/);
  assert.doesNotMatch(EDGE_SOURCE, /voice_id:\s*voiceId/);
});

test('fluxo: autentica -> sanitiza/valida -> calcula cache key -> procura cache -> so entao chama ElevenLabs se for miss', () => {
  const authCallIdx = EDGE_SOURCE.indexOf('const userId = getAuthenticatedUserId(');
  const sanitizeIdx = EDGE_SOURCE.indexOf('const text = sanitizeText(payload.text);');
  const cacheLookupCallIdx = EDGE_SOURCE.indexOf('const cacheRow = await findCacheRow(');
  const providerCallIdx = EDGE_SOURCE.indexOf('const providerResponse = await fetch(providerUrl');
  assert.ok(authCallIdx >= 0 && sanitizeIdx > authCallIdx, 'autenticacao deve vir antes da sanitizacao');
  assert.ok(cacheLookupCallIdx > sanitizeIdx, 'busca de cache deve vir depois da sanitizacao/validacao');
  assert.ok(providerCallIdx > cacheLookupCallIdx, 'chamada ao provedor deve vir depois da busca de cache');
});

test('header de diagnostico X-Uni-Voice-Cache e exposto via CORS -- senao o navegador o esconde do cliente', () => {
  assert.match(EDGE_SOURCE, /'Access-Control-Expose-Headers': 'X-Uni-Voice-Cache'/);
});

test('cache HIT nunca chama a ElevenLabs -- retorna o audio existente com header de diagnostico HIT', () => {
  const hitBlock = EDGE_SOURCE.slice(
    EDGE_SOURCE.indexOf('if (cacheRow && new Date'),
    EDGE_SOURCE.indexOf('} catch {\n      // Falha ao consultar o cache'),
  );
  assert.doesNotMatch(hitBlock, /ELEVENLABS_BASE_URL|xi-api-key/);
  assert.match(hitBlock, /audioResponse\(\s*\n\s*cached\.body/);
  assert.match(hitBlock, /'HIT'/);
});

test('cache MISS chama a ElevenLabs normalmente e salva o resultado (upload + upsert de metadados) em segundo plano', () => {
  assert.match(EDGE_SOURCE, /uploadCacheAudio\(/);
  assert.match(EDGE_SOURCE, /upsertCacheMetadata\(/);
  assert.match(EDGE_SOURCE, /return audioResponse\(audio, contentType, 'MISS', origin\);/);
});

test('upload no storage usa x-upsert (idempotente) -- caminho deterministico, concorrencia grava os mesmos bytes com seguranca', () => {
  const fnBody = EDGE_SOURCE.slice(
    EDGE_SOURCE.indexOf('async function uploadCacheAudio'),
    EDGE_SOURCE.indexOf('async function upsertCacheMetadata'),
  );
  assert.match(fnBody, /'x-upsert': 'true'/);
});

test('upsert de metadados usa on_conflict + merge-duplicates -- concorrencia converge, nunca cria duplicidade permanente', () => {
  const fnBody = EDGE_SOURCE.slice(
    EDGE_SOURCE.indexOf('async function upsertCacheMetadata'),
    EDGE_SOURCE.indexOf('Deno.serve'),
  );
  assert.match(fnBody, /on_conflict=user_id,cache_key/);
  assert.match(fnBody, /Prefer: 'resolution=merge-duplicates/);
});

test('metadado existente mas arquivo ausente (orfao) regenera com seguranca, sem vazar nada -- nunca lanca', () => {
  const hitBlock = EDGE_SOURCE.slice(
    EDGE_SOURCE.indexOf('if (cacheRow && new Date'),
    EDGE_SOURCE.indexOf('} catch {\n      // Falha ao consultar o cache'),
  );
  assert.match(hitBlock, /if \(cached\) \{/);
  assert.match(EDGE_SOURCE, /\/\/ Metadado existe mas o arquivo sumiu/);
});

test('cache expirado (expires_at no passado) e tratado como ausente -- gera novamente', () => {
  assert.match(EDGE_SOURCE, /new Date\(cacheRow\.expires_at\)\.getTime\(\) > Date\.now\(\)/);
});

test('TTL padrao de 30 dias, configuravel via env ELEVENLABS_CACHE_TTL_DAYS', () => {
  assert.match(EDGE_SOURCE, /const DEFAULT_CACHE_TTL_DAYS = 30;/);
  assert.match(EDGE_SOURCE, /Number\(Deno\.env\.get\('ELEVENLABS_CACHE_TTL_DAYS'\)\) \|\| DEFAULT_CACHE_TTL_DAYS/);
});

test('last_accessed_at e atualizado em cache hit de forma best-effort -- falha nunca impede a reproducao (sem await bloqueante)', () => {
  const fnBody = EDGE_SOURCE.slice(
    EDGE_SOURCE.indexOf('function touchLastAccessed'),
    EDGE_SOURCE.indexOf('async function uploadCacheAudio'),
  );
  assert.doesNotMatch(fnBody, /^\s*async function/);
  assert.match(fnBody, /\.catch\(\(\) => \{ \/\* nunca bloqueia a reproducao \*\/ \}\);/);
  const callSite = EDGE_SOURCE.slice(
    EDGE_SOURCE.indexOf('if (cached) {'),
    EDGE_SOURCE.indexOf('return audioResponse(\n            cached.body') + 200,
  );
  assert.doesNotMatch(callSite, /await touchLastAccessed/);
});

test('falha ao consultar/gravar cache (storage ou metadados) nunca quebra a resposta -- sempre cai para gerar/retornar normalmente', () => {
  assert.match(EDGE_SOURCE, /\} catch \{\s*\n\s*\/\/ Falha ao consultar o cache -- segue para gerar normalmente\./);
  assert.match(EDGE_SOURCE, /\} catch \{\s*\n\s*\/\/ Nunca falha a resposta por causa do cache\./);
});

test('sem service role key disponivel, o cache e desabilitado com seguranca (sempre gera, nunca quebra) -- nao e um requisito', () => {
  assert.match(EDGE_SOURCE, /const cacheEnabled = Boolean\(serviceRoleKey\);/);
  assert.match(EDGE_SOURCE, /if \(cacheEnabled\) \{/);
});

test('isolamento por usuario: cache key e storage path SEMPRE incluem userId -- dois usuarios nunca convergem para o mesmo arquivo', () => {
  assert.match(EDGE_SOURCE, /\$\{CACHE_ALGO_VERSION\}:\$\{userId\}:/);
  assert.match(EDGE_SOURCE, /\$\{userId\}\/\$\{cacheKey\}\.mp3/);
  const lookupBody = EDGE_SOURCE.slice(
    EDGE_SOURCE.indexOf('async function findCacheRow'),
    EDGE_SOURCE.indexOf('async function downloadCachedAudio'),
  );
  assert.match(lookupBody, /user_id=eq\.\$\{encodeURIComponent\(userId\)\}/);
});

test('log de diagnóstico registra somente código/status/retry/providerTag, nunca texto, usuário ou segredo', () => {
  assert.match(
    EDGE_SOURCE,
    /console\.warn\('uni_voice_tts_provider_failure', \{\s*\n\s*code, providerStatus, retryable, providerTag: providerTag \|\| null,\s*\n\s*\}\);/,
  );
  assert.doesNotMatch(EDGE_SOURCE, /console\.(?:log|info|warn|error)\([^\n]*(?:text|userId|voiceId|providerKey|serviceRoleKey)/);
});

test('service role key nunca retorna ao cliente -- so usada nos headers server-side das chamadas internas', () => {
  assert.doesNotMatch(EDGE_SOURCE, /jsonResponse\([^)]*serviceRoleKey/);
  assert.doesNotMatch(EDGE_SOURCE, /audioResponse\([^)]*serviceRoleKey/);
});

test('resposta de audio serve diretamente da Edge Function (sem signed URL) -- frontend nao muda, so recebe bytes de audio como antes', () => {
  assert.doesNotMatch(EDGE_SOURCE, /createSignedUrl|signedUrl/);
  assert.match(
    EDGE_SOURCE,
    /function audioResponse\(\s*audio: BodyInit,\s*contentType: string,\s*cacheStatus: 'HIT' \| 'MISS',\s*origin: string,\s*\)/,
  );
});

test('ELEVEN1/ELEVEN2: autenticacao, sanitizacao, limite de caracteres, dados sensiveis e mapeamento de erros continuam intactos', () => {
  assert.match(EDGE_SOURCE, /if \(!authorization\.startsWith\('Bearer '\)\)/);
  assert.match(EDGE_SOURCE, /function sanitizeText/);
  assert.match(EDGE_SOURCE, /if \(text\.length > MAX_TEXT_LENGTH\)/);
  assert.match(EDGE_SOURCE, /containsSensitiveData\(text\)/);
  assert.match(EDGE_SOURCE, /providerResponse\.status === 429/);
  assert.match(EDGE_SOURCE, /'CONFIGURATION_ERROR'/);
});

test('Edge Function preserva autenticacao por usuario e restringe somente a origem do navegador', () => {
  assert.doesNotMatch(EDGE_SOURCE, /allowlist\.has\(|ALLOWED_USER_IDS|readAllowlist/);
  assert.match(EDGE_SOURCE, /Deno\.env\.get\('APP_ALLOWED_ORIGINS'\)/);
  assert.match(EDGE_SOURCE, /jsonResponse\(403, 'ORIGIN_NOT_ALLOWED'/);
  assert.doesNotMatch(EDGE_SOURCE, /'Access-Control-Allow-Origin': '\*'/);
});

// ----------------------------------------------------------------------------
// A decisao de cache permanece 100% server-side. O frontend apenas le o
// header de diagnostico para distinguir cache de geracao na telemetria DEV.
// ----------------------------------------------------------------------------

test('frontend apenas identifica cache HIT; consulta, storage e chave continuam exclusivamente server-side', () => {
  const providerSource = readFileSync(new URL('./elevenLabsTtsProvider.js', import.meta.url), 'utf8');
  const hookSource = readFileSync(new URL('./useUniVoiceTts.js', import.meta.url), 'utf8');
  assert.match(providerSource, /X-Uni-Voice-Cache/);
  assert.doesNotMatch(providerSource, /from\(['"]uni_voice_cache|storage\.from|cache_key/i);
  assert.doesNotMatch(hookSource, /from\(['"]uni_voice_cache|storage\.from|cache_key|X-Uni-Voice-Cache/i);
});
