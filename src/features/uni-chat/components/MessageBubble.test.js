import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseSafeInlineMarkdown, parseSafeMarkdown } from '../../../components/content/safeMarkdown.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// Cobertura estrutural (sem infraestrutura de renderização React no
// repositório), mesmo padrão já usado em todo o projeto.

test('as respostas da Uni não têm botão Ouvir nem voz', async () => {
  const page = await source('MessageBubble.jsx');
  assert.doesNotMatch(page, /onSpeakMessage|VOICE_TTS_STATUS|uni-voice-tts|'Ouvir'/);
  assert.doesNotMatch(page, /useEffect\(/);
});

test('MessageBubble nunca conhece fetch, Audio ou a Edge Function diretamente -- só os props/estado do hook', async () => {
  const page = await source('MessageBubble.jsx');
  assert.doesNotMatch(page, /\bfetch\(|new Audio\(|supabase|ELEVENLABS/i);
});

test('respostas da Uni usam o renderizador Markdown seguro compartilhado com o suporte', async () => {
  const page = await source('MessageBubble.jsx');
  assert.match(page, /import SafeMarkdown/);
  assert.match(page, /<SafeMarkdown className=\{styles\.text\}>\{message\.text\}<\/SafeMarkdown>/);
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
