// FASE ESTADOS DE PROCESSAMENTO (HOTFIX: abandono da revelação progressiva):
// useTextAudioSync.js é um hook React (useState/useEffect) -- sem
// infraestrutura de renderização de hooks neste repositório (mesmo padrão
// já usado em useVoiceIntensity.js). Cobertura estrutural por leitura de
// fonte para o wiring/contrato; a máquina de estado (a parte que realmente
// importa testar exaustivamente) é pura e coberta integralmente em
// textAudioSync.test.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('hook delega a transição de estado a reduceTextAudioSyncState (puro) -- nunca decide playing/stopped/error por conta própria', async () => {
  const hook = await source('./useTextAudioSync.js');
  assert.match(hook, /import \{[\s\S]*?reduceTextAudioSyncState[\s\S]*?\} from '\.\/textAudioSync\.js';/);
  assert.match(hook, /setState\(\(prev\) => reduceTextAudioSyncState\(prev, \{/);
});

test('HOTFIX (abandono da revelação progressiva): não existe mais nenhum requestAnimationFrame/setInterval de revelação', async () => {
  const hook = await source('./useTextAudioSync.js');
  assert.doesNotMatch(hook, /requestAnimationFrame/);
  assert.doesNotMatch(hook, /window\.setInterval/);
  assert.doesNotMatch(hook, /buildRevealedText/);
});

test('rede de segurança: "pending" nunca fica preso indefinidamente -- timeout força fase done', async () => {
  const hook = await source('./useTextAudioSync.js');
  assert.match(hook, /const PENDING_SAFETY_TIMEOUT_MS = 3000;/);
  assert.match(hook, /if \(state\.phase !== TEXT_AUDIO_SYNC_PHASES\.PENDING \|\| state\.id !== activeId\) \{\s*return undefined;\s*\}/);
});

test('o timeout de segurança é sempre cancelado no cleanup -- nunca vaza ao desmontar ou trocar de mensagem/status', async () => {
  const hook = await source('./useTextAudioSync.js');
  assert.match(hook, /return \(\) => window\.clearTimeout\(timeoutId\);/);
});

test('displayText é sempre \'\' fora de "done" -- nunca revela uma prévia em "pending"/"idle"', async () => {
  const hook = await source('./useTextAudioSync.js');
  assert.match(hook, /const isDone = state\.id === activeId && state\.phase === TEXT_AUDIO_SYNC_PHASES\.DONE;/);
  assert.match(hook, /const displayText = isDone \? activeText : '';/);
});

test('displayText, quando "done", é sempre o texto COMPLETO de uma vez -- nunca um prefixo parcial', async () => {
  const hook = await source('./useTextAudioSync.js');
  assert.doesNotMatch(hook, /state\.count/);
  assert.doesNotMatch(hook, /revealedCharCount/i);
});

test('sem mensagem ativa (activeMessage null), activeMessageId é null -- chamador deve usar message.text integralmente', async () => {
  const hook = await source('./useTextAudioSync.js');
  assert.match(hook, /const activeId = activeMessage\?\.id \?\? null;/);
  assert.match(hook, /activeMessageId: activeId,/);
});
