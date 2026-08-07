import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseSafeInlineMarkdown, parseSafeMarkdown } from '../../../components/content/safeMarkdown.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// ELEVEN2 -- controle de voz por mensagem em MessageBubble.jsx. Cobertura
// estrutural (sem infraestrutura de renderização React no repositório),
// mesmo padrão já usado em todo o projeto.
// ============================================================================

test('botão de voz só é elegível em mensagens da Uni (showSpeak exige !isUser)', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /const showSpeak = !isUser && voiceEnabled && typeof onSpeakMessage === 'function' && message\.text;/);
});

test('sem voiceEnabled (preferência desabilitada) ou sem onSpeakMessage, nenhum controle renderiza', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /voiceEnabled = false,/);
  assert.match(page, /\{showSpeak && \(/);
});

test('estado ativo só se aplica quando isActiveVoiceMessage -- outras mensagens sempre veem IDLE (botão "Ouvir" neutro)', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /const activeStatus = isActiveVoiceMessage \? voiceStatus : VOICE_TTS_STATUS\.IDLE;/);
});

test('clique no botão primário: gerar (Ouvir/retry), ou pausar/retomar quando já tocando -- nunca ambos ao mesmo tempo', async () => {
  const page = await source('MessageBubble.jsx');
  const fnBody = page.slice(page.indexOf('function handlePrimaryVoiceClick'), page.indexOf('const primaryVoiceLabel'));
  assert.match(fnBody, /if \(isLoadingVoice\) return;/);
  assert.match(fnBody, /if \(isPlayingVoice \|\| isPausedVoice\) \{\s*\n\s*onPauseResumeVoice\?\.\(\);\s*\n\s*return;/);
  assert.match(fnBody, /onSpeakMessage\?\.\(message\);/);
});

test('botão Parar (stop) só aparece durante reprodução ou pausa -- nunca durante loading/idle/erro', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /const showStopVoice = isPlayingVoice \|\| isPausedVoice;/);
  assert.match(page, /\{showStopVoice && \(/);
  assert.match(page, /onClick=\{\(\) => onStopVoice\?\.\(\)\}/);
});

test('todos os 7 estados visuais mínimos exigidos pela fase estão cobertos (Ouvir/Gerando/Reproduzindo/Pausado/Parar/Erro/indisponível via ausência)', async () => {
  const page = await source('MessageBubble.jsx');
  for (const label of ['Ouvir', 'Gerando', 'Pausar', 'Retomar', 'Parar', 'Tentar novamente']) {
    assert.match(page, new RegExp(label));
  }
  // "Voz indisponível": quando voiceEnabled é false, showSpeak nunca é
  // true -- o botão simplesmente não aparece (ver teste de ocultação).
});

test('aria-label contextual muda por estado; aria-busy só durante loading; aria-pressed reflete reprodução ativa', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /aria-label=\{primaryVoiceLabel\}/);
  assert.match(page, /aria-busy=\{isLoadingVoice\}/);
  assert.match(page, /aria-pressed=\{isPlayingVoice\}/);
  assert.match(
    page,
    /const primaryVoiceLabel = isLoadingVoice\s*\n\s*\? 'Gerando voz…'\s*\n\s*: isPlayingVoice\s*\n\s*\? 'Pausar leitura da resposta'\s*\n\s*: isPausedVoice\s*\n\s*\? 'Retomar leitura da resposta'\s*\n\s*: isErrorVoice\s*\n\s*\? 'Tentar novamente'\s*\n\s*: 'Ouvir resposta da Uni';/,
  );
});

test('estado é anunciado por role="status" aria-live="polite", com texto sempre presente (não depende só de cor/ícone)', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /className=\{styles\.voiceStatus\} role="status" aria-live="polite"/);
});

test('erro mostra a mensagem amigável do hook (voiceError.message), com fallback seguro se ausente', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /voiceError\?\.message \?\? 'Não foi possível reproduzir esta resposta\.'/);
});

test('botão primário fica desabilitado durante o loading -- evita disparos duplicados de geração', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /disabled=\{isLoadingVoice\}/);
});

test('ícones reaproveitados/consistentes com o padrão já existente (Speaker/Stop) mais um novo Pause mínimo', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /function SpeakerIcon\(\)/);
  assert.match(page, /function StopIcon\(\)/);
  assert.match(page, /function PauseIcon\(\)/);
  assert.match(page, /aria-hidden="true"/);
});

test('nenhuma reprodução é disparada automaticamente pelo componente -- só onClick explícito', async () => {
  const page = await source('MessageBubble.jsx');
  assert.doesNotMatch(page, /useEffect\(/);
  assert.doesNotMatch(page, /autoPlay/i);
});

test('MessageBubble nunca conhece fetch, Audio ou a Edge Function diretamente -- só os props/estado do hook', async () => {
  const page = await source('MessageBubble.jsx');
  assert.doesNotMatch(page, /\bfetch\(|new Audio\(|supabase|ELEVENLABS/i);
});

test('respostas da Uni usam o renderizador Markdown seguro compartilhado com o suporte', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /import SafeMarkdown/);
  assert.match(page, /<SafeMarkdown className=\{styles\.text\}>\{resolvedText\}<\/SafeMarkdown>/);
  assert.match(page, /const resolvedText = displayText \|\| message\.text;/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
});

test('Markdown seguro suporta texto, parágrafos, quebras e listas', () => {
  assert.deepEqual(parseSafeMarkdown('Texto comum'), [
    { type: 'paragraph', lines: ['Texto comum'] },
  ]);
  assert.deepEqual(parseSafeMarkdown('Linha 1\nLinha 2\n\n- Item A\n- Item B'), [
    { type: 'paragraph', lines: ['Linha 1', 'Linha 2'] },
    { type: 'list', ordered: false, items: ['Item A', 'Item B'] },
  ]);
  assert.deepEqual(parseSafeMarkdown('1. Primeiro\n2. Segundo'), [
    { type: 'list', ordered: true, items: ['Primeiro', 'Segundo'] },
  ]);
});

test('Markdown seguro reconhece negrito sem interpretar HTML ou links', () => {
  assert.deepEqual(parseSafeInlineMarkdown('Saldo **confirmado**.'), [
    { type: 'text', value: 'Saldo ' },
    { type: 'strong', value: 'confirmado' },
    { type: 'text', value: '.' },
  ]);
  assert.deepEqual(parseSafeInlineMarkdown('<script>alert(1)</script> [site](javascript:alert(1))'), [
    { type: 'text', value: '<script>alert(1)</script> [site](javascript:alert(1))' },
  ]);
});

test('Markdown seguro trata conteúdo vazio e mensagens antigas persistidas', () => {
  assert.deepEqual(parseSafeMarkdown(''), []);
  assert.deepEqual(parseSafeMarkdown(null), []);
  assert.equal(parseSafeMarkdown('**Conta**\nDescrição antiga').length, 1);
});
