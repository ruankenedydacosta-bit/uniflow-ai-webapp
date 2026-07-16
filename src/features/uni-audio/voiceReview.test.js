import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { selectAudio } from '../uni-audio-selection/audioSelector.js';
import { voiceManifest } from './voiceManifest.js';
import { validateVoiceReviewEntries } from './voiceReview.js';
import { VOICE_REVIEW_ENTRIES } from './voiceReviewCatalog.js';

const REPLACEMENT_IDS = Object.freeze([
  'confirmation_general_004',
  'confirmation_general_005',
  'proactive_suggestion_001',
  'proactive_suggestion_002',
  'processing_005',
  'returning_user_004',
]);

test('revisão manual reconhece 104 IDs únicos do catálogo', () => {
  assert.equal(VOICE_REVIEW_ENTRIES.length, 104);
  assert.equal(new Set(VOICE_REVIEW_ENTRIES.map((entry) => entry.audioId)).size, 104);
  assert.equal(validateVoiceReviewEntries(VOICE_REVIEW_ENTRIES, voiceManifest.clips), true);
});

test('98 aprovados preservam elegibilidade estrutural anterior', () => {
  const approved = voiceManifest.clips.filter((clip) => clip.reviewStatus === 'approved');
  assert.equal(approved.length, 98);
  approved.forEach((clip) => {
    assert.equal(clip.enabled, true);
    assert.equal(clip.replacementPending, false);
    assert.equal(clip.reviewedBy, 'founder_manual_review_v1');
  });
});

test('seis substituições futuras permanecem ativas e elegíveis no MVP', async () => {
  const replacements = voiceManifest.clips.filter((clip) => clip.replacementPending);
  assert.deepEqual(replacements.map((clip) => clip.id).sort(), [...REPLACEMENT_IDS].sort());
  await Promise.all(replacements.map((clip) => access(fileURLToPath(clip.src))));
  replacements.forEach((clip) => {
    assert.equal(clip.reviewStatus, 'replace');
    assert.equal(clip.enabled, true);
    assert.equal(clip.approvedForMvp, true);
    assert.equal(clip.replacementPriority, 'future');
    assert.equal('disabledReason' in clip, false);
    assert.equal(selectAudio({
      context: clip.context,
      manifest: { clips: [clip] },
      userGesture: true,
      mockData: true,
      holdDurationMs: 400,
      silenceDurationMs: 3_500,
      operationElapsedMs: 3_000,
    }).status, 'selected');
  });
});

test('cinco desativados anteriores preservam seus motivos originais', () => {
  const priorDisabled = voiceManifest.clips.filter((clip) => !clip.enabled);
  assert.equal(priorDisabled.length, 5);
  assert.ok(priorDisabled.every((clip) => clip.reviewStatus === 'unreviewed'));
  assert.ok(priorDisabled.every((clip) => typeof clip.disabledReason === 'string'));
});

test('IDs desconhecidos e duplicados invalidam a revisão', () => {
  const valid = VOICE_REVIEW_ENTRIES[0];
  assert.equal(validateVoiceReviewEntries([{ ...valid, audioId: 'unknown' }], voiceManifest.clips), false);
  assert.equal(validateVoiceReviewEntries([valid, { ...valid }], voiceManifest.clips), false);
});

test('listening_006 e listening_007 mantêm texto, arquivo e checksum corretos', async () => {
  const expected = {
    listening_006: {
      text: 'Fica tranquilo pode falar no seu tempo',
      fileName: 'listening_006.mp3',
      checksum: '979656a9fa1cd1a0cc04642d714b76b88a082265087a56ae3c50985f21a2aa54',
    },
    listening_007: {
      text: 'Pode falar no seu tempo.',
      fileName: 'listening_007.mp3',
      checksum: '2340c1dc2e5055930806abd1376b8499496b44dcd31621f2aa15b0ab5277fe5a',
    },
  };
  for (const [id, contract] of Object.entries(expected)) {
    const clip = voiceManifest.clips.find((entry) => entry.id === id);
    const bytes = await readFile(fileURLToPath(clip.src));
    assert.equal(clip.text, contract.text);
    assert.equal(clip.fileName, contract.fileName);
    assert.equal(clip.origin.checksumSha256, contract.checksum);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), contract.checksum);
  }
});

test('catálogo permanece único e todos os 104 src continuam existentes', async () => {
  const ids = voiceManifest.clips.map((clip) => clip.id);
  const clipsWithSource = voiceManifest.clips.filter((clip) => clip.src);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(clipsWithSource.length, 104);
  await Promise.all(clipsWithSource.map((clip) => access(fileURLToPath(clip.src))));
});
