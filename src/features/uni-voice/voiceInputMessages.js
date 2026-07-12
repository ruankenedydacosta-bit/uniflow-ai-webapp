import { VOICE_CAPTURE_STATES } from './voiceCaptureReducer.js';

const ERROR_MESSAGES = Object.freeze({
  balanced: {
    permission_denied: 'Não consegui acessar o microfone. Você pode liberar a permissão no navegador ou escrever para mim.',
    unsupported: 'Este navegador ainda não oferece reconhecimento de voz compatível. Você pode continuar escrevendo normalmente.',
    no_speech: 'Não consegui ouvir com clareza. Tente novamente quando estiver pronto.',
    error: 'Não consegui concluir a escuta agora. Sua conversa por texto continua disponível.',
  },
  direct: {
    permission_denied: 'O microfone está sem permissão. Libere o acesso no navegador ou continue por texto.',
    unsupported: 'O reconhecimento de voz não está disponível neste navegador. Continue por texto.',
    no_speech: 'Não identifiquei uma fala completa. Tente novamente quando quiser.',
    error: 'A escuta não foi concluída. O campo de texto continua disponível.',
  },
  warm: {
    permission_denied: 'Não consegui acessar o microfone agora. Tudo bem: você pode liberar a permissão ou escrever para mim.',
    unsupported: 'Este navegador ainda não reconhece voz por aqui. Podemos continuar normalmente por texto.',
    no_speech: 'Não consegui ouvir com clareza. Quando estiver pronto, pode tentar de novo com calma.',
    error: 'A escuta não terminou como esperado. Sua conversa está segura e você pode continuar por texto.',
  },
  strategic: {
    permission_denied: 'O acesso ao microfone não foi autorizado. Ajuste a permissão do navegador ou use a entrada textual.',
    unsupported: 'Este ambiente não oferece reconhecimento de voz compatível. A entrada textual permanece disponível.',
    no_speech: 'A captura terminou sem uma transcrição final confiável. Tente novamente quando for conveniente.',
    error: 'Não foi possível concluir o reconhecimento de voz. O fluxo textual continua disponível sem impacto.',
  },
});

export function getVoiceInputMessage({ status, interimTranscript = '', profileId = 'balanced' } = {}) {
  const messages = ERROR_MESSAGES[profileId] ?? ERROR_MESSAGES.balanced;

  if (status === VOICE_CAPTURE_STATES.REQUESTING_PERMISSION) {
    return 'Aguardando permissão para usar o microfone...';
  }
  if (status === VOICE_CAPTURE_STATES.LISTENING) {
    return interimTranscript ? `Ouvindo: ${interimTranscript}` : 'Estou ouvindo... fale naturalmente.';
  }
  if (status === VOICE_CAPTURE_STATES.PROCESSING) {
    return 'Organizando o que você disse...';
  }
  if (status === VOICE_CAPTURE_STATES.COMPLETED) {
    return 'Áudio captado. A Uni vai organizar isso com calma.';
  }
  if (status === VOICE_CAPTURE_STATES.CANCELED) {
    return 'Escuta cancelada. Você pode falar ou escrever quando quiser.';
  }

  return messages[status] ?? '';
}
