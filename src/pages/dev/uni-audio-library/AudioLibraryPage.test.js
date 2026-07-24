import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { voiceManifest } from '../../../features/uni-audio/voiceManifest.js';
import {
  filterAudioLibrary,
  getAdjacentPlayableClip,
  getAudioLibraryCounts,
  getOfficialReviewState,
} from './audioLibraryModel.js';
import {
  AUDIO_REVIEW_STORAGE_KEY,
  createAudioReviewExport,
  downloadAudioReviewJson,
  readAudioReviews,
  writeAudioReview,
} from './audioReviewStorage.js';

const pageUrl = new URL('./AudioLibraryPage.jsx', import.meta.url);
const stylesUrl = new URL('./AudioLibraryPage.module.css', import.meta.url);
const routesUrl = new URL('../../../app/routes.jsx', import.meta.url);

function createStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    data,
  };
}

test('lista o catálogo completo, incluindo ativos e desativados', () => {
  const result = filterAudioLibrary(voiceManifest.clips);
  const counts = getAudioLibraryCounts(voiceManifest.clips, result);
  assert.equal(result.length, 109);
  assert.deepEqual(counts, { total: 109, active: 104, disabled: 5, filtered: 109 });
});

test('filtra por categoria, contexto e emoção', () => {
  assert.ok(filterAudioLibrary(voiceManifest.clips, { category: 'processing' }).every((clip) => clip.category === 'processing'));
  assert.ok(filterAudioLibrary(voiceManifest.clips, { context: 'returning_user' }).every((clip) => clip.context === 'returning_user'));
  assert.ok(filterAudioLibrary(voiceManifest.clips, { emotion: 'warmly' }).every((clip) => clip.emotion === 'warmly'));
});

test('pesquisa texto falado e ID sem diferenciar maiúsculas', () => {
  assert.ok(filterAudioLibrary(voiceManifest.clips, { search: 'DESEJA PROSSEGUIR' }).length > 0);
  assert.equal(filterAudioLibrary(voiceManifest.clips, { search: 'error_temporary_001' })[0].id, 'error_temporary_001');
});

test('filtra ativos e desativados', () => {
  assert.equal(filterAudioLibrary(voiceManifest.clips, { status: 'active' }).length, 104);
  assert.equal(filterAudioLibrary(voiceManifest.clips, { status: 'disabled' }).length, 5);
});

test('tester distingue os quatro estados oficiais de revisão', async () => {
  assert.equal(getOfficialReviewState({ reviewStatus: 'approved', enabled: true }), 'approved');
  assert.equal(getOfficialReviewState({ replacementPending: true, enabled: true }), 'replacement_future');
  assert.equal(getOfficialReviewState({ reviewStatus: 'unreviewed', enabled: false }), 'safety_disabled');
  assert.equal(getOfficialReviewState({ reviewStatus: 'unreviewed', enabled: true }), 'unreviewed');
  const source = await readFile(pageUrl, 'utf8');
  for (const label of ['Aprovado', 'Substituição futura — ativo no MVP', 'Desativado por segurança', 'Não revisado']) {
    assert.match(source, new RegExp(label));
  }
});

test('anterior e próximo consideram apenas áudios reproduzíveis', () => {
  const clips = [
    { id: 'a', enabled: true, src: '/a.mp3' },
    { id: 'off', enabled: false, src: null },
    { id: 'b', enabled: true, src: '/b.mp3' },
  ];
  assert.equal(getAdjacentPlayableClip(clips, 'a', 1).id, 'b');
  assert.equal(getAdjacentPlayableClip(clips, 'a', -1).id, 'b');
});

test('revisão local persiste sem mutar o manifesto', () => {
  const storage = createStorage();
  const before = JSON.stringify(voiceManifest);
  const reviews = writeAudioReview('error_temporary_001', { status: 'approved', note: 'Boa dicção' }, storage, 0);
  assert.equal(readAudioReviews(storage).error_temporary_001.note, 'Boa dicção');
  assert.equal(reviews.error_temporary_001.timestamp, '1970-01-01T00:00:00.000Z');
  assert.equal(JSON.stringify(voiceManifest), before);
  assert.ok(storage.data.has(AUDIO_REVIEW_STORAGE_KEY));
});

test('exportação JSON contém somente dados de revisão necessários', () => {
  const exported = createAudioReviewExport({
    b: { status: 'review', note: 'Ruído', timestamp: '2026-01-01T00:00:00.000Z' },
    a: { status: 'approved', note: '', timestamp: '2026-01-02T00:00:00.000Z' },
  });
  assert.deepEqual(exported.map((item) => item.audioId), ['a', 'b']);
  assert.deepEqual(Object.keys(exported[0]), ['audioId', 'status', 'observation', 'timestamp']);
});

test('download da revisão usa arquivo local e remove o link temporário', () => {
  const calls = [];
  const anchor = {
    click: () => calls.push('click'),
    remove: () => calls.push('remove'),
  };
  const documentRef = {
    body: { append: (node) => calls.push(node === anchor ? 'append' : 'invalid') },
    createElement: () => anchor,
  };
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:local-review';
  URL.revokeObjectURL = (url) => calls.push(`revoke:${url}`);
  try {
    downloadAudioReviewJson({}, documentRef);
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
  assert.equal(anchor.download, 'uniflow-audio-review-v1.json');
  assert.deepEqual(calls, ['append', 'click', 'remove', 'revoke:blob:local-review']);
});

test('interface oferece controles completos sem autoplay', async () => {
  const source = await readFile(pageUrl, 'utf8');
  for (const contract of ['manager.play(', 'manager.pause()', 'manager.resume()', 'manager.stop()', 'manager.setVolume(', 'Sequencial', 'Repetir']) {
    assert.match(source, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(source, /useEffect\([^)]*manager\.play|autoPlay/);
  assert.match(source, /onEnded/);
  assert.match(source, /aria-live="polite"/);
});

test('novo play usa exclusivamente VoiceManager persistente', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /useVoiceManager\(\)/);
  assert.doesNotMatch(source, /new Audio|createAudioPlayer|createVoiceManager/);
});

test('erro de áudio é controlado sem quebrar a interface', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /catch \{/);
  assert.match(source, /Não foi possível reproduzir este áudio/);
  assert.match(source, /role="alert"/);
});

test('rota e importação existem somente em DEV e sem link público', async () => {
  const routes = await readFile(routesUrl, 'utf8');
  assert.match(routes, /import\.meta\.env\.DEV[\s\S]*?lazy\(\(\) => import\('\.\.\/pages\/dev\/uni-audio-library'\)\)/);
  assert.match(routes, /path: '\/dev\/uni-audio-library'/);
  assert.doesNotMatch(routes, /appRoutes[\s\S]*?\/dev\/uni-audio-library/);
});

test('tester (revisão de clipes) não contém HTTP, backend, microfone ou ElevenLabs diretamente -- TTS vive isolado em TtsPlayground', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.doesNotMatch(source, /fetch\(|axios|XMLHttpRequest|WebSocket|ElevenLabs|speechSynthesis|getUserMedia|supabase/i);
});

// ============================================================================
// ELEVEN1 -- area de teste de TTS (TtsPlayground) montada na mesma pagina
// DEV, sem afetar o revisor de clipes estaticos preexistente.
// ============================================================================

test('AudioLibraryPage monta o TtsPlayground (fundação de TTS) na página DEV', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /import TtsPlayground from '\.\/components\/TtsPlayground\.jsx';/);
  assert.match(source, /<TtsPlayground \/>/);
});

test('layout cobre mobile, tablet, desktop, foco e reduced motion', async () => {
  const styles = await readFile(stylesUrl, 'utf8');
  assert.match(styles, /@media \(max-width: 1100px\)/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /@media \(max-width: 350px\)/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /position: fixed/);
});
