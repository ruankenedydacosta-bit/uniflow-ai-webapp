// LOTE E -- SimplifiedUniSupportPage.jsx: experiência dedicada "Uni
// Suporte" no shell escuro do Lote F. Mesmo padrão de cobertura estrutural
// por leitura de fonte dos demais testes do simplified-app (sem Testing
// Library/jsdom): valida que a página usa a base de suporte existente
// (useUniSupportChat / conversation_type='support' / SUPPORT_SUGGESTED_QUESTIONS),
// apresenta UMA resposta de cada vez sem empilhar todo o histórico,
// não carrega nenhum contexto financeiro.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('LOTE E: página dedicada usa useUniSupportChat (conversation_type=support) e sugests de suporte existentes', async () => {
  const page = await source('./SimplifiedUniSupportPage.jsx');
  assert.match(page, /import \{ useUniSupportChat \} from '\.\.\/uni-support\/useUniSupportChat\.js';/);
  assert.match(page, /const chat = useUniSupportChat\(\{ workspaceId, workspaceType \}\)/);
  assert.match(page, /SUPPORT_SUGGESTED_QUESTIONS/);
  assert.match(page, /chat\.sendText\(/);
});

test('LOTE E: identidade "Uni Suporte" presente no cabeçalho e no card de resposta', async () => {
  const page = await source('./SimplifiedUniSupportPage.jsx');
  assert.match(page, /title: 'Uni Suporte',/);
  assert.match(page, /<h1>\{SUPPORT_IDENTITY\.title\}<\/h1>/);
  assert.match(page, /<span>Uni Suporte<\/span>/);
});

test('LOTE E: mostra UMA última resposta por vez (nunca o histórico empilhado em lista)', async () => {
  const page = await source('./SimplifiedUniSupportPage.jsx');
  assert.match(page, /lastUni = useMemo\(/);
  assert.match(page, /\[\.\.\.chat\.messages\]\.reverse\(\)\.find\(\(message\) => message\.from === 'uni'\)/);
  assert.match(page, /lastUser = useMemo\(/);
  assert.doesNotMatch(page, /chat\.messages\.map\(/);
  assert.match(page, /showResponse = Boolean\(lastUni\?\.text\) && !isProcessing/);
  assert.match(page, /aria-label="Próximas sugestões"/);
});

test('Uni Suporte não fala as respostas: sem botão Ouvir nem narração', async () => {
  const page = await source('./SimplifiedUniSupportPage.jsx');
  assert.doesNotMatch(page, /useUniVoiceTts|useVoicePreference|VOICE_TTS_STATUS|uni-voice-tts|Ouvir resposta/);
});

test('LOTE E: página não importa nada financeiro (nem ferramentas, nem contexto financeiro)', async () => {
  const page = await source('./SimplifiedUniSupportPage.jsx');
  assert.doesNotMatch(page, /useUniConversation|UniChatPage|financialContext|tool.?call|generateContextualResponse/i);
});

test('LOTE E: back volta para SUPPORT e a rota monta a página dedicada', async () => {
  const page = await source('./SimplifiedUniSupportPage.jsx');
  assert.match(page, /navigate\(SIMPLIFIED_ROUTES\.SUPPORT\)/);
  const routes = await source('../../app/routes.jsx');
  assert.match(routes, /<SimplifiedUniSupportPage \/>/);
});

test('LOTE E: card de sugestões após a resposta usa no máximo 3 itens (próximos passos)', async () => {
  const page = await source('./SimplifiedUniSupportPage.jsx');
  assert.match(page, /SUPPORT_SUGGESTED_QUESTIONS\.slice\(0, 3\)/);
});