import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  buildDownloadedFile,
  canOpenDownloadedFile,
  openDownloadedFile,
  resetDownloadedFileShareCapability,
} from './downloadedFileShare.js';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function makeFile(name = 'uniflow-relatorio-2026-08.xlsx') {
  return buildDownloadedFile(new Blob(['conteudo'], { type: XLSX_TYPE }), name);
}

// A capacidade "aprendida" é estado de MÓDULO (fato do dispositivo, não do
// componente) -- sem este reset, um caso que simula falha vazaria para os
// seguintes.
beforeEach(() => resetDownloadedFileShareCapability());

// ============================================================================
// DOWNLOAD-SUCCESS1 -- capacidade real de "Abrir arquivo" (Web Share API
// nível 2). Módulo puro: testado por comportamento, com navigator falso --
// nunca por leitura de fonte.
// ============================================================================

test('buildDownloadedFile devolve um File com nome e tipo -- canShare/share nunca aceitam Blob cru', () => {
  const file = makeFile();
  assert.ok(file instanceof File);
  assert.equal(file.name, 'uniflow-relatorio-2026-08.xlsx');
  assert.equal(file.type, XLSX_TYPE);
});

test('buildDownloadedFile devolve null sem blob ou sem filename -- nunca um File inválido', () => {
  assert.equal(buildDownloadedFile(null, 'a.xlsx'), null);
  assert.equal(buildDownloadedFile(new Blob(['x']), ''), null);
});

test('canOpenDownloadedFile é false quando o navegador não tem Web Share (maioria dos desktops)', () => {
  assert.equal(canOpenDownloadedFile(makeFile(), {}), false);
});

test('canOpenDownloadedFile é false quando existe share mas NÃO canShare -- share sozinho não garante suporte a arquivos', () => {
  assert.equal(canOpenDownloadedFile(makeFile(), { share: () => {} }), false);
});

test('canOpenDownloadedFile é false quando canShare recusa ESTE arquivo -- checagem por arquivo, nunca genérica', () => {
  const navigatorRef = { share: () => {}, canShare: () => false };
  assert.equal(canOpenDownloadedFile(makeFile(), navigatorRef), false);
});

test('canOpenDownloadedFile é true quando canShare aceita o arquivo, e recebe { files: [file] }', () => {
  let received = null;
  const navigatorRef = {
    share: () => {},
    canShare: (payload) => { received = payload; return true; },
  };
  const file = makeFile();
  assert.equal(canOpenDownloadedFile(file, navigatorRef), true);
  assert.deepEqual(received, { files: [file] });
});

test('canOpenDownloadedFile nunca lança quando canShare explode -- navegador hostil vira apenas false', () => {
  const navigatorRef = { share: () => {}, canShare: () => { throw new Error('boom'); } };
  assert.equal(canOpenDownloadedFile(makeFile(), navigatorRef), false);
});

test('canOpenDownloadedFile é false sem arquivo', () => {
  assert.equal(canOpenDownloadedFile(null, { share: () => {}, canShare: () => true }), false);
});

test('openDownloadedFile compartilha o arquivo e reporta sucesso', async () => {
  let shared = null;
  const navigatorRef = {
    canShare: () => true,
    share: async (payload) => { shared = payload; },
  };
  const file = makeFile();
  assert.deepEqual(await openDownloadedFile(file, navigatorRef), { ok: true, reason: null });
  assert.deepEqual(shared, { files: [file] });
});

test('openDownloadedFile nunca tenta compartilhar quando a capacidade não existe -- reason "unsupported"', async () => {
  let called = false;
  const navigatorRef = { canShare: () => false, share: async () => { called = true; } };
  assert.deepEqual(await openDownloadedFile(makeFile(), navigatorRef), { ok: false, reason: 'unsupported' });
  assert.equal(called, false);
});

// Cancelar a folha de compartilhamento é uma ESCOLHA do usuário, nunca uma
// falha -- a UI não deve mostrar erro nesse caso.
test('openDownloadedFile distingue cancelamento do usuário (AbortError) de falha real', async () => {
  const abort = Object.assign(new Error('cancelado'), { name: 'AbortError' });
  const cancelled = { canShare: () => true, share: async () => { throw abort; } };
  assert.deepEqual(await openDownloadedFile(makeFile(), cancelled), { ok: false, reason: 'cancelled' });

  const broken = { canShare: () => true, share: async () => { throw new Error('sem permissão'); } };
  assert.deepEqual(await openDownloadedFile(makeFile(), broken), { ok: false, reason: 'failed' });
});

test('openDownloadedFile nunca lança -- sempre resolve em { ok, reason }', async () => {
  const result = await openDownloadedFile(makeFile(), {});
  assert.equal(result.ok, false);
  assert.equal(typeof result.reason, 'string');
});

// ============================================================================
// SHARE-TRUTHFUL1 -- o bug relatado: canShare({files}) responde `true` e o
// share() real falha mesmo assim (WebView sem ponte de compartilhamento,
// nenhum app capaz de receber o tipo, política do ambiente). Não dá para
// prever -- então a capacidade é APRENDIDA com a falha real.
// ============================================================================

test('navegador que MENTE (canShare true, share falha) deixa de ser considerado capaz -- botão nunca mais é oferecido na sessão', async () => {
  const lying = { canShare: () => true, share: async () => { throw new Error('sem alvo'); } };
  const file = makeFile();

  // Antes da falha, a promessa do navegador é aceita.
  assert.equal(canOpenDownloadedFile(file, lying), true);

  assert.deepEqual(await openDownloadedFile(file, lying), { ok: false, reason: 'failed' });

  // Depois da falha real, a promessa não vale mais -- nem para este
  // arquivo, nem para um download seguinte.
  assert.equal(canOpenDownloadedFile(file, lying), false);
  assert.equal(canOpenDownloadedFile(makeFile('outro-relatorio.xlsx'), lying), false);
});

test('depois de aprendida a incapacidade, openDownloadedFile nem tenta compartilhar de novo', async () => {
  let attempts = 0;
  const lying = {
    canShare: () => true,
    share: async () => { attempts += 1; throw new Error('sem alvo'); },
  };

  await openDownloadedFile(makeFile(), lying);
  assert.equal(attempts, 1);

  const second = await openDownloadedFile(makeFile(), lying);
  assert.deepEqual(second, { ok: false, reason: 'unsupported' });
  assert.equal(attempts, 1, 'não insiste em um share que já provou não funcionar');
});

// Cancelar é escolha do usuário: o dispositivo continua capaz, e o botão
// deve continuar disponível para ele tentar de novo.
test('cancelamento do usuário NÃO marca o dispositivo como incapaz', async () => {
  const abort = Object.assign(new Error('cancelado'), { name: 'AbortError' });
  const cancelling = { canShare: () => true, share: async () => { throw abort; } };
  const file = makeFile();

  assert.deepEqual(await openDownloadedFile(file, cancelling), { ok: false, reason: 'cancelled' });
  assert.equal(canOpenDownloadedFile(file, cancelling), true, 'cancelar não tira a capacidade');
});

test('share bem-sucedido preserva a capacidade para os próximos downloads', async () => {
  const working = { canShare: () => true, share: async () => {} };
  const file = makeFile();

  assert.deepEqual(await openDownloadedFile(file, working), { ok: true, reason: null });
  assert.equal(canOpenDownloadedFile(file, working), true);
});

test('a incapacidade aprendida NÃO é persistida -- reabrir o app reavalia (reset devolve ao estado inicial)', async () => {
  const lying = { canShare: () => true, share: async () => { throw new Error('sem alvo'); } };
  await openDownloadedFile(makeFile(), lying);
  assert.equal(canOpenDownloadedFile(makeFile(), lying), false);

  resetDownloadedFileShareCapability();
  assert.equal(canOpenDownloadedFile(makeFile(), lying), true);
});
