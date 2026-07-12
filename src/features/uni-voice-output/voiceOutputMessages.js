export const VOICE_OUTPUT_MESSAGES = Object.freeze({
  idle: '',
  preparing: 'Preparando a voz da Uni...',
  generating: 'Gerando a voz natural para esta demonstração...',
  playing: 'Uni está reproduzindo a orientação.',
  stopped: 'Reprodução interrompida.',
  quota_reached: 'A demonstração de voz premium chegou ao limite desta sessão. Você pode continuar com a voz padrão.',
  unauthorized: 'A voz premium está disponível apenas no modo de apresentação.',
  unsupported: 'A reprodução de voz não está disponível neste ambiente.',
  provider_error: 'Não consegui gerar a voz natural agora. Você pode continuar pela voz padrão.',
  fallback_active: 'Não consegui gerar a voz natural agora. Vou continuar pela voz padrão.',
});

export function getVoiceOutputMessage(status, errorMessage = '') {
  return errorMessage || VOICE_OUTPUT_MESSAGES[status] || '';
}
