import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// ELEVEN1 -- TtsPlayground.jsx, area de teste da fundacao de TTS isolada em
// /dev/uni-audio-library. Nao integrada ao chat principal.
// ============================================================================

test('usa apenas useUniVoiceTts() -- nenhum fetch/Audio/chave direto no componente', async () => {
  const page = await source('TtsPlayground.jsx');
  assert.match(page, /import \{ useUniVoiceTts, VOICE_TTS_STATUS, MAX_TTS_TEXT_LENGTH \} from '\.\.\/\.\.\/\.\.\/\.\.\/features\/uni-voice-tts';/);
  assert.match(page, /const voice = useUniVoiceTts\(\);/);
  // "ElevenLabs" pode aparecer como texto de UI (título da seção, dev-only);
  // o que nunca pode existir é fetch/Audio direto nem a chave do provedor.
  assert.doesNotMatch(page, /\bfetch\(|new Audio\(|ELEVENLABS_API_KEY|xi-api-key/i);
});

test('campo de texto, contador de caracteres e botão gerar voz existem', async () => {
  const page = await source('TtsPlayground.jsx');
  assert.match(page, /id="tts-text"/);
  assert.match(page, /aria-describedby="tts-char-count"/);
  assert.match(page, /id="tts-char-count"/);
  assert.match(page, /aria-label="Gerar voz a partir do texto"/);
});

test('botões play/pausar/retomar/parar/cancelar têm aria-label e ficam desabilitados conforme o estado', async () => {
  const page = await source('TtsPlayground.jsx');
  for (const label of ['Reproduzir', 'Pausar', 'Retomar', 'Parar', 'Cancelar geração de voz']) {
    assert.match(page, new RegExp(`aria-label="${label}"`));
  }
  assert.match(page, /disabled=\{isPlaying \|\| isLoading\}/);
  assert.match(page, /disabled=\{!isPlaying\}/);
  assert.match(page, /disabled=\{!isPaused\}/);
});

test('botão cancelar geração só aparece durante o loading (não some sem ação do usuário)', async () => {
  const page = await source('TtsPlayground.jsx');
  assert.match(page, /\{isLoading && \(/);
  assert.match(page, /onClick=\{\(\) => voice\.cancel\(\)\}/);
});

test('nunca gera voz automaticamente -- geração só ocorre via handleGenerate, acionado por clique explícito', async () => {
  const page = await source('TtsPlayground.jsx');
  assert.doesNotMatch(page, /useEffect\([^)]*voice\.speak/s);
  assert.match(page, /async function handleGenerate\(\) \{\s*\n\s*if \(!canGenerate\) return;\s*\n\s*await voice\.speak\(text\);/);
});

test('estado atual é anunciado (role="status", aria-live) e o erro usa role="alert"', async () => {
  const page = await source('TtsPlayground.jsx');
  assert.match(page, /className=\{styles\.status\} role="status" aria-live="polite"/);
  assert.match(page, /className=\{styles\.error\} role="alert"/);
});

test('indicação clara de "não configurado" (client health check + erro NOT_CONFIGURED/UNAVAILABLE)', async () => {
  const page = await source('TtsPlayground.jsx');
  assert.match(page, /voice\.healthCheck\(\)/);
  assert.match(page, /clientHealth\?\.available === false/);
  assert.match(page, /voice\.error\?\.code === 'NOT_CONFIGURED'/);
  assert.match(page, /A geração de voz ainda não está configurada neste ambiente\./);
});

test('limite de caracteres bloqueia geração (isOverLimit) antes mesmo de chamar o hook', async () => {
  const page = await source('TtsPlayground.jsx');
  assert.match(page, /const isOverLimit = text\.length > MAX_TTS_TEXT_LENGTH;/);
  assert.match(page, /const canGenerate = Boolean\(text\.trim\(\)\) && !isOverLimit && !isLoading;/);
});
