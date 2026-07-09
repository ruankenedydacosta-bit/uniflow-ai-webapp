import { conversationMessages } from './uniAI.mock';

let messageIdCounter = conversationMessages.length;

export function createMessage(role, content) {
  messageIdCounter += 1;

  return {
    id: `${role}-${messageIdCounter}`,
    role,
    content,
  };
}

export function getMockUniResponse(question) {
  const normalizedQuestion = question.toLowerCase();

  if (normalizedQuestion.includes('economizar')) {
    return 'Para economizar esta semana sem gerar desconforto, eu começaria pelos gastos variáveis: alimentação fora, transporte e pequenas assinaturas. Escolha um limite simples para os próximos sete dias e acompanhe diariamente, sem tentar resolver tudo de uma vez.';
  }

  if (normalizedQuestion.includes('reserva')) {
    return 'Sua reserva parece em um caminho saudável quando cobre os compromissos essenciais e continua crescendo com regularidade. O próximo passo é comparar o valor atual com seus custos fixos mensais e manter aportes consistentes, mesmo que pequenos.';
  }

  if (normalizedQuestion.includes('priorizar')) {
    return 'Eu priorizaria o que reduz risco no curto prazo: organizar recebíveis, revisar despesas em atenção e proteger sua reserva. Depois disso, vale olhar para metas de crescimento com mais tranquilidade.';
  }

  if (normalizedQuestion.includes('fluxo de caixa')) {
    return 'Seu fluxo de caixa fica mais claro quando separamos três camadas: dinheiro disponível hoje, entradas confirmadas e despesas que ainda podem ser ajustadas. Minha sugestão é registrar os próximos sete dias antes de tomar uma decisão maior.';
  }

  if (normalizedQuestion.includes('despesas')) {
    return 'Para olhar despesas com calma, eu separaria o que é essencial, recorrente e ajustável. Assim você não precisa cortar tudo: dá para começar pelos gastos que menos afetam sua rotina e acompanhar o impacto no saldo projetado.';
  }

  if (normalizedQuestion.includes('metas')) {
    return 'Suas metas ficam mais fáceis de acompanhar quando cada uma tem valor-alvo, prazo e uma contribuição possível. Eu manteria as metas ativas, mas priorizaria primeiro as que protegem sua segurança financeira.';
  }

  return 'Posso te ajudar a transformar essa pergunta em um próximo passo financeiro mais claro. Para começar, eu olharia o impacto no saldo projetado, nas metas ativas e nas despesas que pedem atenção nesta semana.';
}

export function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isProbablySafari() {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('safari') && !userAgent.includes('chrome') && !userAgent.includes('chromium');
}

export function getPortugueseVoice(voices) {
  return voices.find((voice) => voice.lang === 'pt-BR') ?? voices.find((voice) => voice.lang?.startsWith('pt')) ?? null;
}

export function getLastUniMessage(messages) {
  return [...messages].reverse().find((message) => message.role === 'uni');
}

export function getVoiceFeedback(volume, hasAudioMeter) {
  if (!hasAudioMeter) {
    return {
      message: 'Estou ouvindo... fale naturalmente.',
      className: 'volumeMedium',
    };
  }

  if (volume < 0.18) {
    return {
      message: 'Estou ajustando a escuta... pode falar naturalmente.',
      className: 'volumeLow',
    };
  }

  if (volume < 0.5) {
    return {
      message: 'Áudio claro.',
      className: 'volumeMedium',
    };
  }

  return {
    message: 'Áudio claro.',
    className: 'volumeHigh',
  };
}
