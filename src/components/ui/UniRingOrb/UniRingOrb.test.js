import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  resolveUniRingOrbMotion,
  resolveUniRingOrbState,
  resolveUniRingThickness,
  UNI_RING_ORB_MIN_MARK_SIZE,
  UNI_RING_ORB_STATES,
} from './uniRingOrbModel.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('resolve os quatro estados e prioriza ouvindo quando a pessoa interrompe a Uni', () => {
  assert.equal(resolveUniRingOrbState(), UNI_RING_ORB_STATES.IDLE);
  assert.equal(resolveUniRingOrbState({ isThinking: true }), UNI_RING_ORB_STATES.THINKING);
  assert.equal(resolveUniRingOrbState({ isSpeaking: true }), UNI_RING_ORB_STATES.SPEAKING);
  assert.equal(
    resolveUniRingOrbState({ isListening: true, isSpeaking: true, isThinking: true }),
    UNI_RING_ORB_STATES.LISTENING,
  );
  assert.equal(
    resolveUniRingOrbState({ isThinking: true, isSpeaking: true }),
    UNI_RING_ORB_STATES.THINKING,
  );
});

test('pensando gira mais rápido e brilha mais; parada é a mais lenta e sem ondas', () => {
  const idle = resolveUniRingOrbMotion(UNI_RING_ORB_STATES.IDLE);
  const thinking = resolveUniRingOrbMotion(UNI_RING_ORB_STATES.THINKING);
  const listening = resolveUniRingOrbMotion(UNI_RING_ORB_STATES.LISTENING);
  const speaking = resolveUniRingOrbMotion(UNI_RING_ORB_STATES.SPEAKING);

  for (const motion of [listening, speaking, thinking]) {
    assert.ok(motion.ring < idle.ring);
    assert.ok(motion.glow > idle.glow);
  }
  assert.ok(thinking.ring < listening.ring && thinking.ring < speaking.ring);
  assert.equal(idle.ripple, 0);
  assert.equal(thinking.ripple, 0);
  assert.ok(listening.ripple > 0 && speaking.ripple > 0);
  assert.ok(speaking.ripple < listening.ripple, 'falando pulsa mais rápido que ouvindo');
});

test('estado desconhecido cai em parada', () => {
  assert.deepEqual(
    resolveUniRingOrbMotion('qualquer'),
    resolveUniRingOrbMotion(UNI_RING_ORB_STATES.IDLE),
  );
});

test('espessura do anel acompanha o tamanho com piso de 1,5px', () => {
  assert.equal(resolveUniRingThickness(18), 1.5);
  assert.equal(resolveUniRingThickness(140), 2);
  assert.equal(resolveUniRingThickness(Number.NaN), 1.5);
});

test('símbolo só aparece a partir do tamanho mínimo', async () => {
  const component = await source('./UniRingOrb.jsx');
  assert.equal(UNI_RING_ORB_MIN_MARK_SIZE, 28);
  assert.match(component, /const showsMark = size >= UNI_RING_ORB_MIN_MARK_SIZE;/);
});

test('cores vêm dos tokens da marca, nunca de hex solto', async () => {
  const css = await source('./UniRingOrb.module.css');
  const component = await source('./UniRingOrb.jsx');
  // #000 é só o canal alfa da máscara do anel, não uma cor visível.
  assert.doesNotMatch(css.replaceAll('#000', ''), /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(component, /#[0-9a-f]{6}\b/i);
  assert.match(css, /var\(--uf-blue-700\)/);
  assert.match(css, /var\(--uf-purple-600\)/);
  assert.match(css, /var\(--uf-green-500\)/);
});

test('gradientes do SVG usam id único por instância', async () => {
  const component = await source('./UniRingOrb.jsx');
  assert.match(component, /const gradientId = useId\(\);/);
  assert.doesNotMatch(component, /id="uL/);
});

test('nível da voz só observa o stream do pipeline e não re-renderiza por quadro', async () => {
  const component = await source('./UniRingOrb.jsx');
  assert.match(component, /useVoiceIntensity\(\{[\s\S]*?getStream: getVoiceStream,[\s\S]*?publishState: false,/);
  assert.match(component, /active: Boolean\(state === UNI_RING_ORB_STATES\.LISTENING && getVoiceStream\)/);
  assert.match(component, /style\.setProperty\('--orb-level'/);
  assert.doesNotMatch(component, /getUserMedia|MediaRecorder|getTracks\(\)/);
});

test('orb é decorativo: quem o usa dá o nome acessível ao botão', async () => {
  const component = await source('./UniRingOrb.jsx');
  assert.match(component, /className=\{cx\(styles\.root, className\)\}\s+data-state=\{state\}\s+aria-hidden="true"/);
});

test('com menos movimento o orb para de girar e mantém as cores', async () => {
  const css = await source('./UniRingOrb.module.css');
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

  assert.ok(reduced.length < css.length, 'falta o bloco de prefers-reduced-motion');
  for (const selector of ['.ring', '.ringInner', '.markOuter', '.markInner']) {
    assert.ok(reduced.includes(selector), `${selector} continua animando com menos movimento`);
  }
  assert.match(reduced, /animation:\s*none/);
  assert.doesNotMatch(reduced, /background|stop-color|fill:/, 'menos movimento não pode mudar cor');
});
