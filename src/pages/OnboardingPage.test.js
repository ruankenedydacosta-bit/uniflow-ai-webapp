import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { voiceManifest } from '../features/uni-audio/voiceManifest.js';
import { selectAudio } from '../features/uni-audio-selection/index.js';

test('onboarding prepara first_app_access sem substituir o audio ausente', async () => {
  const source = await readFile(new URL('./OnboardingPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /playContext\('first_app_access'/);
  assert.equal(selectAudio({ context: 'first_app_access', manifest: voiceManifest }).status, 'silent');
  assert.equal(voiceManifest.clips.some((clip) => clip.text === 'Seja bem-vindo à UniFlow.'), false);
});

test('first welcome so e solicitado depois da conclusao do onboarding', async () => {
  const source = await readFile(new URL('./OnboardingPage.jsx', import.meta.url), 'utf8');
  const completion = source.indexOf('await completeOnboarding');
  const firstWelcome = source.lastIndexOf("playContext('first_app_access'");
  assert.ok(completion >= 0 && firstWelcome > completion);
});
