import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  computeRmsFromTimeDomainData,
  prefersReducedMotion,
  smoothLevel,
  toVisualLevel,
} from './useVoiceIntensity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, 'useVoiceIntensity.js'), 'utf8');

test('computeRmsFromTimeDomainData retorna 0 para silêncio (buffer todo em 128)', () => {
  const silence = new Uint8Array(64).fill(128);
  assert.equal(computeRmsFromTimeDomainData(silence), 0);
});

test('computeRmsFromTimeDomainData retorna energia maior para uma onda de amplitude maior', () => {
  const quiet = new Uint8Array(64).fill(140); // desvio pequeno de 128
  const loud = new Uint8Array(64).fill(220); // desvio grande de 128
  const quietRms = computeRmsFromTimeDomainData(quiet);
  const loudRms = computeRmsFromTimeDomainData(loud);
  assert.ok(loudRms > quietRms);
});

test('computeRmsFromTimeDomainData nunca lança para buffer vazio/nulo', () => {
  assert.equal(computeRmsFromTimeDomainData(new Uint8Array(0)), 0);
  assert.equal(computeRmsFromTimeDomainData(null), 0);
  assert.equal(computeRmsFromTimeDomainData(undefined), 0);
});

test('smoothLevel suaviza em direção ao valor bruto sem saltar direto (transição suave)', () => {
  const step1 = smoothLevel(0, 1, 0.35);
  assert.ok(step1 > 0 && step1 < 1);
  const step2 = smoothLevel(step1, 1, 0.35);
  assert.ok(step2 > step1 && step2 < 1);
});

test('toVisualLevel aplica ganho e nunca ultrapassa [0, 1]', () => {
  assert.equal(toVisualLevel(0), 0);
  assert.equal(toVisualLevel(1), 1); // saturado pelo teto, mesmo com ganho 4x
  assert.equal(toVisualLevel(-1), 0); // nunca negativo
  assert.ok(toVisualLevel(0.1) > 0 && toVisualLevel(0.1) < 1);
});

test('prefersReducedMotion lê prefers-reduced-motion via matchMedia, nunca lança sem runtime', () => {
  assert.equal(prefersReducedMotion(undefined), false);
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: false }) }), false);
});

// ============================================================================
// BUG 3: verificação estrutural do hook (React puro, sem harness de
// renderização neste projeto) -- garante reaproveitamento do stream
// existente, liberação de recursos e respeito a prefers-reduced-motion.
// ============================================================================

test('useVoiceIntensity nunca chama getUserMedia/MediaRecorder -- só usa o stream recebido via getStream()', () => {
  assert.doesNotMatch(SOURCE, /getUserMedia|new .*MediaRecorder/);
  assert.match(SOURCE, /const stream = getStream\?\.\(\);/);
  assert.match(SOURCE, /audioContext\.createMediaStreamSource\(stream\)/);
});

test('useVoiceIntensity libera AnalyserNode/AudioContext e cancela requestAnimationFrame ao parar', () => {
  const idx = SOURCE.indexOf('const stopAnalysis = useCallback(() => {');
  assert.ok(idx > -1);
  const slice = SOURCE.slice(idx, idx + 700);
  assert.match(slice, /cancelAnimationFrame/);
  assert.match(slice, /sourceRef\.current\?\.disconnect\(\);/);
  assert.match(slice, /audioContext\.close\(\)/);
});

test('useVoiceIntensity chama stopAnalysis tanto quando `active` cai quanto no unmount do componente', () => {
  assert.match(SOURCE, /if \(!active\) \{[\s\S]{0,300}stopAnalysis\(\);/);
  assert.match(SOURCE, /useEffect\(\(\) => \(\) => stopAnalysis\(\), \[stopAnalysis\]\);/);
});

test('useVoiceIntensity respeita prefers-reduced-motion desligando a análise em si, não só via CSS', () => {
  assert.match(SOURCE, /if \(prefersReducedMotion\(browserRuntime\)\) return undefined;/);
});

test('Safari retoma AudioContext suspenso antes de iniciar a análise', () => {
  assert.match(SOURCE, /audioContext\.state === 'suspended'/);
  assert.match(SOURCE, /audioContext\.resume\?\.\(\)/);
  assert.match(SOURCE, /resumeResult\.catch\(\(\) => \{\}\)\.finally\(startAnalysis\)/);
});
