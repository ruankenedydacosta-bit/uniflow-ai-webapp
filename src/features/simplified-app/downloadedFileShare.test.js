import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDownloadedFile,
  canOpenDownloadedFile,
  openDownloadedFile,
} from './downloadedFileShare.js';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function makeFile(name = 'uniflow-relatorio-2026-08.xlsx') {
  return buildDownloadedFile(new Blob(['conteudo'], { type: XLSX_TYPE }), name);
}

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
