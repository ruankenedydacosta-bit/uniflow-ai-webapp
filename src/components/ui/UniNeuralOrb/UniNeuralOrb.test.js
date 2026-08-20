import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  clampUniNeuralVoiceLevel,
  resolveUniNeuralOrbState,
  smoothUniNeuralValue,
  UNI_NEURAL_ORB_STATES,
} from './uniNeuralOrbModel.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('resolve os três estados visuais e prioriza listening durante barge-in', () => {
  assert.equal(resolveUniNeuralOrbState(), UNI_NEURAL_ORB_STATES.IDLE);
  assert.equal(resolveUniNeuralOrbState({ isSpeaking: true }), UNI_NEURAL_ORB_STATES.SPEAKING);
  assert.equal(resolveUniNeuralOrbState({ isListening: true }), UNI_NEURAL_ORB_STATES.LISTENING);
  assert.equal(
    resolveUniNeuralOrbState({ isListening: true, isSpeaking: true }),
    UNI_NEURAL_ORB_STATES.LISTENING,
  );
});

test('intensidade respeita sensibilidade e permanece limitada entre zero e um', () => {
  assert.equal(clampUniNeuralVoiceLevel(-1, 2), 0);
  assert.equal(clampUniNeuralVoiceLevel(0.25, 2), 0.5);
  assert.equal(clampUniNeuralVoiceLevel(2, 2), 1);
  assert.equal(clampUniNeuralVoiceLevel(Number.NaN, 2), 0);
});

test('smoothing aproxima o alvo sem saltos e sem ultrapassá-lo', () => {
  const attack = smoothUniNeuralValue(0, 1, 16, 72);
  const release = smoothUniNeuralValue(1, 0, 16, 220);
  assert.ok(attack > 0 && attack < 1);
  assert.ok(release > 0 && release < 1);
  assert.ok(attack > 1 - release);
});

test('componente usa OGL e a marca oficial sem redesenhar o símbolo', async () => {
  const component = await source('./UniNeuralOrb.jsx');
  assert.match(component, /from 'ogl'/);
  assert.match(component, /uniflow-mark\.png/);
  assert.match(component, /logoSrc = uniflowMarkAsset/);
  assert.match(component, /<img className=\{styles\.logo\} src=\{logoSrc\} alt=""/);
});

test('análise visual reaproveita o stream ativo e nunca abre ou encerra o microfone', async () => {
  const component = await source('./UniNeuralOrb.jsx');
  assert.match(component, /from '\.\.\/\.\.\/\.\.\/features\/uni-voice\/useVoiceIntensity\.js'/);
  assert.match(component, /useVoiceIntensity\(\{[\s\S]*?getStream: getVoiceStream,[\s\S]*?publishState: false,/);
  assert.doesNotMatch(component, /getUserMedia|MediaRecorder/);
  assert.doesNotMatch(component, /getTracks\(\)|track\.stop\(/);
});

test('fim da escuta zera detecção sem aguardar unmount', async () => {
  const component = await source('./UniNeuralOrb.jsx');
  assert.match(component, /if \(!enableVoiceControl \|\| !isListening\) \{[\s\S]*?voiceDetectedRef\.current = false;[\s\S]*?onVoiceDetectedRef\.current\?\.\(false\);/);
});

test('WebGL e observadores possuem cleanup completo e render pausável', async () => {
  const component = await source('./UniNeuralOrb.jsx');
  for (const cleanup of [
    'cancelAnimationFrame',
    'resizeObserver?.disconnect()',
    'intersectionObserver?.disconnect()',
    'removeResizeFallback()',
    "removeEventListener('visibilitychange'",
    "getExtension('WEBGL_lose_context')?.loseContext()",
  ]) {
    assert.ok(component.includes(cleanup), cleanup);
  }
  assert.match(component, /powerPreference: 'low-power'/);
  assert.match(component, /Math\.min\(window\.devicePixelRatio \|\| 1, 1\.5\)/);
  assert.match(component, /targetListening \|\| targetSpeaking \? 1000 \/ 60 : 1000 \/ 30/);
});

test('shader usa apenas a paleta de marca e diferencia listening de speaking', async () => {
  const component = await source('./UniNeuralOrb.jsx');
  assert.match(component, /BRAND_PURPLE/);
  assert.match(component, /BRAND_BLUE/);
  assert.match(component, /BRAND_CYAN/);
  assert.match(component, /uniform float uListening;/);
  assert.match(component, /uniform float uSpeaking;/);
  assert.match(component, /uniform float uVoice;/);
});

test('componente é decorativo e mantém compatibilidade por className', async () => {
  const [component, css] = await Promise.all([
    source('./UniNeuralOrb.jsx'),
    source('./UniNeuralOrb.module.css'),
  ]);
  assert.match(component, /className=\{cx\(styles\.root, className\)\}/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(css, /\.root \{[\s\S]*?pointer-events: none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('contrato TypeScript publica a interface sem mudar o runtime JavaScript do projeto', async () => {
  const declarations = await source('./index.d.ts');
  for (const property of [
    'className?: string',
    'enableVoiceControl?: boolean',
    'voiceSensitivity?: number',
    'isListening?: boolean',
    'isSpeaking?: boolean',
    'logoSrc?: string',
    'onVoiceDetected?: (detected: boolean) => void',
  ]) {
    assert.ok(declarations.includes(property), property);
  }
});
