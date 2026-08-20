import { useCallback, useEffect, useRef } from 'react';
import { Mesh, Program, Renderer, Triangle, Vec3 } from 'ogl';
import uniflowMarkAsset from '../../../assets/branding/uniflow-mark.png';
import { useVoiceIntensity } from '../../../features/uni-voice/useVoiceIntensity.js';
import { cx } from '../../../utils/cx.js';
import {
  clampUniNeuralVoiceLevel,
  resolveUniNeuralOrbState,
  smoothUniNeuralValue,
  UNI_NEURAL_ORB_STATES,
} from './uniNeuralOrbModel.js';
import styles from './UniNeuralOrb.module.css';

const VERTEX_SHADER = /* glsl */ `
  precision highp float;
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uResolution;
  uniform float uVoice;
  uniform float uListening;
  uniform float uSpeaking;
  uniform float uReducedMotion;
  varying vec2 vUv;

  const vec3 BRAND_PURPLE = vec3(0.5451, 0.3608, 0.9647);
  const vec3 BRAND_BLUE = vec3(0.2314, 0.5098, 0.9647);
  const vec3 BRAND_CYAN = vec3(0.0, 0.8314, 1.0);

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), local.x),
      local.y
    );
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.55;
    mat2 rotation = mat2(0.82, -0.57, 0.57, 0.82);
    for (int octave = 0; octave < 4; octave++) {
      value += amplitude * valueNoise(point);
      point = rotation * point * 2.03 + 11.7;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 resolution = max(uResolution.xy, vec2(1.0));
    vec2 point = (vUv * resolution - 0.5 * resolution) / min(resolution.x, resolution.y);
    point *= 2.0;

    float reducedFactor = mix(1.0, 0.18, uReducedMotion);
    float time = uTime * reducedFactor;
    float radius = length(point);
    float angle = atan(point.y, point.x);

    float idlePulse = 0.5 + 0.5 * sin(time * 1.05);
    float speakingPulse = 0.5 + 0.5 * sin(time * 3.0 + radius * 10.0);
    float organic = fbm(vec2(angle * 0.72 + time * 0.12, radius * 3.1 - time * 0.1));
    float listeningEnergy = uListening * (0.18 + uVoice * 0.82);
    float speakingEnergy = uSpeaking * (0.42 + speakingPulse * 0.2);
    float edgeDisplacement = (organic - 0.5) * (0.022 + listeningEnergy * 0.065);
    edgeDisplacement += sin(angle * 6.0 - time * 2.2) * listeningEnergy * 0.018;
    float orbRadius = 0.59 + edgeDisplacement + idlePulse * 0.006 + speakingEnergy * 0.012;

    float orbMask = 1.0 - smoothstep(orbRadius - 0.012, orbRadius + 0.025, radius);
    float innerDepth = 1.0 - smoothstep(0.06, orbRadius, radius);
    float rim = exp(-abs(radius - orbRadius) * 42.0);
    float innerRing = exp(-abs(radius - 0.43) * 34.0);

    float flowA = fbm(point * 2.15 + vec2(time * 0.14, -time * 0.1));
    float flowB = fbm(point.yx * 3.05 + vec2(-time * 0.11, time * 0.16));
    float colorMix = clamp(flowA * 0.75 + 0.22 * sin(angle * 2.0 + time * 0.5), 0.0, 1.0);
    vec3 color = mix(BRAND_PURPLE, BRAND_BLUE, colorMix);
    color = mix(color, BRAND_CYAN, clamp(flowB * 0.55 + listeningEnergy * 0.28, 0.0, 0.8));
    color *= 0.32 + innerDepth * 0.72;
    color += rim * mix(BRAND_BLUE, BRAND_CYAN, uListening) * (0.34 + listeningEnergy * 0.74);
    color += innerRing * mix(BRAND_PURPLE, BRAND_BLUE, speakingPulse) * (0.08 + speakingEnergy * 0.2);

    float listeningWaveA = exp(-abs(radius - (0.68 + uVoice * 0.05)) * 55.0)
      * uListening * (0.12 + uVoice * 0.72);
    float listeningWaveB = exp(-abs(radius - (0.76 + uVoice * 0.075)) * 48.0)
      * uListening * (0.05 + uVoice * 0.42);
    float speakingWave = exp(-abs(radius - (0.69 + 0.018 * sin(time * 2.2))) * 52.0)
      * uSpeaking * 0.24;
    color += BRAND_CYAN * listeningWaveA;
    color += mix(BRAND_BLUE, BRAND_PURPLE, 0.55) * listeningWaveB;
    color += mix(BRAND_PURPLE, BRAND_BLUE, 0.5) * speakingWave;

    float alpha = max(orbMask * 0.96, rim * 0.62);
    alpha = max(alpha, listeningWaveA * 0.9);
    alpha = max(alpha, listeningWaveB * 0.68);
    alpha = max(alpha, speakingWave * 0.58);
    alpha *= 1.0 - smoothstep(0.84, 1.02, radius);

    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

/**
 * Orbe visual da Uni. O componente nunca abre nem encerra o microfone:
 * ele analisa somente o MediaStream já pertencente ao pipeline de voz.
 *
 * @param {{
 *   className?: string,
 *   enableVoiceControl?: boolean,
 *   voiceSensitivity?: number,
 *   isListening?: boolean,
 *   isSpeaking?: boolean,
 *   logoSrc?: string,
 *   onVoiceDetected?: (detected: boolean) => void,
 *   getVoiceStream?: () => MediaStream | null,
 *   getVoiceSessionId?: () => number | string | null,
 * }} props
 */
export function UniNeuralOrb({
  className,
  enableVoiceControl = true,
  voiceSensitivity = 1.5,
  isListening = false,
  isSpeaking = false,
  logoSrc = uniflowMarkAsset,
  onVoiceDetected,
  getVoiceStream,
  getVoiceSessionId,
}) {
  const canvasHostRef = useRef(null);
  const renderStateRef = useRef({
    isListening,
    isSpeaking,
    voiceLevel: 0,
  });
  const voiceDetectedRef = useRef(false);
  const onVoiceDetectedRef = useRef(onVoiceDetected);

  useEffect(() => {
    onVoiceDetectedRef.current = onVoiceDetected;
  }, [onVoiceDetected]);

  useEffect(() => {
    renderStateRef.current.isListening = isListening;
    renderStateRef.current.isSpeaking = isSpeaking;
    if (!enableVoiceControl || !isListening) {
      renderStateRef.current.voiceLevel = 0;
      if (voiceDetectedRef.current) {
        voiceDetectedRef.current = false;
        onVoiceDetectedRef.current?.(false);
      }
    }
  }, [enableVoiceControl, isListening, isSpeaking]);

  const handleVoiceLevel = useCallback((level) => {
    const nextLevel = clampUniNeuralVoiceLevel(level, voiceSensitivity);
    renderStateRef.current.voiceLevel = nextLevel;
    const detected = nextLevel > 0.08;
    if (detected !== voiceDetectedRef.current) {
      voiceDetectedRef.current = detected;
      onVoiceDetectedRef.current?.(detected);
    }
  }, [voiceSensitivity]);

  useVoiceIntensity({
    getStream: getVoiceStream,
    getSessionId: getVoiceSessionId,
    active: Boolean(enableVoiceControl && isListening && getVoiceStream),
    onLevel: handleVoiceLevel,
    publishState: false,
  });

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || typeof window === 'undefined') return undefined;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    let renderer;
    let gl;
    let resizeObserver;
    let intersectionObserver;
    let removeResizeFallback = () => {};
    let frameId = 0;
    let disposed = false;
    let isVisible = true;
    let lastFrameAt = 0;
    let lastRenderedAt = 0;
    let currentVoice = 0;
    let currentListening = 0;
    let currentSpeaking = 0;

    const stopFrameLoop = () => {
      if (!frameId) return;
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    };

    try {
      renderer = new Renderer({
        alpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
        premultipliedAlpha: true,
        powerPreference: 'low-power',
      });
      gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      host.replaceChildren(gl.canvas);

      const geometry = new Triangle(gl);
      const program = new Program(gl, {
        vertex: VERTEX_SHADER,
        fragment: FRAGMENT_SHADER,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new Vec3(1, 1, 1) },
          uVoice: { value: 0 },
          uListening: { value: 0 },
          uSpeaking: { value: 0 },
          uReducedMotion: { value: reducedMotion ? 1 : 0 },
        },
      });
      const mesh = new Mesh(gl, { geometry, program });

      const resize = () => {
        if (disposed) return;
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        renderer.setSize(width, height);
        gl.canvas.style.width = `${width}px`;
        gl.canvas.style.height = `${height}px`;
        program.uniforms.uResolution.value.set(
          gl.canvas.width,
          gl.canvas.height,
          gl.canvas.width / Math.max(1, gl.canvas.height),
        );
      };

      const renderFrame = (time) => {
        frameId = 0;
        if (disposed || !isVisible || document.visibilityState === 'hidden') return;

        const orbState = resolveUniNeuralOrbState(renderStateRef.current);
        const targetListening = orbState === UNI_NEURAL_ORB_STATES.LISTENING ? 1 : 0;
        const targetSpeaking = orbState === UNI_NEURAL_ORB_STATES.SPEAKING ? 1 : 0;
        const targetVoice = targetListening ? renderStateRef.current.voiceLevel : 0;
        const deltaMs = lastFrameAt ? Math.min(64, time - lastFrameAt) : 16;
        lastFrameAt = time;
        currentVoice = smoothUniNeuralValue(currentVoice, targetVoice, deltaMs, targetVoice > currentVoice ? 72 : 220);
        currentListening = smoothUniNeuralValue(currentListening, targetListening, deltaMs, 170);
        currentSpeaking = smoothUniNeuralValue(currentSpeaking, targetSpeaking, deltaMs, 260);

        const minimumFrameMs = targetListening || targetSpeaking ? 1000 / 60 : 1000 / 30;
        if (time - lastRenderedAt >= minimumFrameMs) {
          lastRenderedAt = time;
          program.uniforms.uTime.value = time * 0.001;
          program.uniforms.uVoice.value = currentVoice;
          program.uniforms.uListening.value = currentListening;
          program.uniforms.uSpeaking.value = currentSpeaking;
          renderer.render({ scene: mesh });
        }
        frameId = window.requestAnimationFrame(renderFrame);
      };

      const startFrameLoop = () => {
        if (disposed || frameId || !isVisible || document.visibilityState === 'hidden') return;
        lastFrameAt = 0;
        frameId = window.requestAnimationFrame(renderFrame);
      };

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') stopFrameLoop();
        else startFrameLoop();
      };

      if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
      } else {
        window.addEventListener('resize', resize, { passive: true });
        removeResizeFallback = () => window.removeEventListener('resize', resize);
      }
      if ('IntersectionObserver' in window) {
        intersectionObserver = new IntersectionObserver(([entry]) => {
          isVisible = Boolean(entry?.isIntersecting);
          if (isVisible) startFrameLoop();
          else stopFrameLoop();
        }, { rootMargin: '80px' });
        intersectionObserver.observe(host);
      }
      document.addEventListener('visibilitychange', handleVisibilityChange);
      resize();
      startFrameLoop();

      return () => {
        disposed = true;
        stopFrameLoop();
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        removeResizeFallback();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (host.contains(gl.canvas)) host.removeChild(gl.canvas);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      };
    } catch {
      host.replaceChildren();
      return () => {
        disposed = true;
        stopFrameLoop();
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        removeResizeFallback();
      };
    }
  }, []);

  useEffect(() => () => {
    if (voiceDetectedRef.current) onVoiceDetectedRef.current?.(false);
  }, []);

  const state = resolveUniNeuralOrbState({ isListening, isSpeaking });

  return (
    <span className={cx(styles.root, className)} data-state={state} aria-hidden="true">
      <span className={styles.energyBase} />
      <span ref={canvasHostRef} className={styles.canvasHost} />
      <span className={styles.logoCore}>
        <img className={styles.logo} src={logoSrc} alt="" width="463" height="512" />
      </span>
    </span>
  );
}
