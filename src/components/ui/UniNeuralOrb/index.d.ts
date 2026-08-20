import type { ReactElement } from 'react';

export interface UniNeuralOrbProps {
  className?: string;
  enableVoiceControl?: boolean;
  voiceSensitivity?: number;
  isListening?: boolean;
  isSpeaking?: boolean;
  logoSrc?: string;
  onVoiceDetected?: (detected: boolean) => void;
  getVoiceStream?: () => MediaStream | null;
  getVoiceSessionId?: () => number | string | null;
}

export declare function UniNeuralOrb(props: UniNeuralOrbProps): ReactElement;

export declare const UNI_NEURAL_ORB_STATES: Readonly<{
  IDLE: 'idle';
  LISTENING: 'listening';
  SPEAKING: 'speaking';
}>;

export declare function clampUniNeuralVoiceLevel(level: unknown, sensitivity?: number): number;
export declare function resolveUniNeuralOrbState(props?: {
  isListening?: boolean;
  isSpeaking?: boolean;
}): 'idle' | 'listening' | 'speaking';
export declare function smoothUniNeuralValue(
  current: unknown,
  target: unknown,
  deltaMs: unknown,
  responseMs?: number,
): number;
