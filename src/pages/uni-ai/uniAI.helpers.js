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
    return 'Para economizar esta semana sem gerar desconforto, eu começaria pelos gastos variáveis: alimentação fora, transporte e pequenas assinaturas. Escolha um limite simples para os próximos sete dias e acompanhe diariamente, sem tentar resolver tudo de uma vez. Quer que eu transforme isso em um plano simples para esta semana?';
  }

  if (normalizedQuestion.includes('reserva')) {
    return 'Sua reserva parece em um caminho saudável quando cobre os compromissos essenciais e continua crescendo com regularidade. O próximo passo é comparar o valor atual com seus custos fixos mensais e manter aportes consistentes, mesmo que pequenos. Posso te ajudar a estimar quantos meses de segurança você já tem hoje.';
  }

  if (normalizedQuestion.includes('priorizar')) {
    return 'Eu priorizaria o que reduz risco no curto prazo: organizar recebíveis, revisar despesas em atenção e proteger sua reserva. Depois disso, vale olhar para metas de crescimento com mais tranquilidade. Se quiser, posso ordenar essas prioridades por impacto e urgência.';
  }

  if (normalizedQuestion.includes('fluxo de caixa')) {
    return 'Seu fluxo de caixa fica mais claro quando separamos três camadas: dinheiro disponível hoje, entradas confirmadas e despesas que ainda podem ser ajustadas. Minha sugestão é registrar os próximos sete dias antes de tomar uma decisão maior. Posso montar essa visão em passos curtos.';
  }

  if (normalizedQuestion.includes('despesas')) {
    return 'Para olhar despesas com calma, eu separaria o que é essencial, recorrente e ajustável. Assim você não precisa cortar tudo: dá para começar pelos gastos que menos afetam sua rotina e acompanhar o impacto no saldo projetado. Quer que eu sugira a primeira categoria para revisar?';
  }

  if (normalizedQuestion.includes('metas')) {
    return 'Suas metas ficam mais fáceis de acompanhar quando cada uma tem valor-alvo, prazo e uma contribuição possível. Eu manteria as metas ativas, mas priorizaria primeiro as que protegem sua segurança financeira. Posso te ajudar a escolher a meta principal deste mês.';
  }

  return 'Posso te ajudar a transformar essa pergunta em um próximo passo financeiro mais claro. Para começar, eu olharia o impacto no saldo projetado, nas metas ativas e nas despesas que pedem atenção nesta semana. Se quiser, eu posso organizar isso em uma recomendação prática.';
}

export function createInsightReport(question, response) {
  const normalizedQuestion = question.toLowerCase();

  if (normalizedQuestion.includes('reserva')) {
    return {
      summary: 'Sua reserva parece em construção saudável, desde que continue protegendo os compromissos essenciais e mantendo aportes regulares.',
      findings: [
        'O ponto principal é comparar sua reserva com seus custos fixos mensais.',
        'A regularidade dos aportes pesa mais do que tentar fazer grandes movimentos de uma vez.',
        'A reserva deve ser protegida antes de metas mais agressivas.',
      ],
      nextSteps: [
        'Calcular quantos meses de segurança você tem hoje.',
        'Definir um aporte mínimo mensal realista.',
        'Revisar a reserva antes de assumir novos compromissos.',
      ],
      response,
    };
  }

  if (normalizedQuestion.includes('economizar') || normalizedQuestion.includes('despesas')) {
    return {
      summary: 'Existe espaço para economizar sem criar desconforto, começando pelos gastos variáveis e ajustáveis.',
      findings: [
        'Pequenos gastos recorrentes podem estar reduzindo sua margem semanal.',
        'Não parece necessário cortar tudo ao mesmo tempo.',
        'O melhor caminho é acompanhar impacto no saldo projetado.',
      ],
      nextSteps: [
        'Escolher uma categoria ajustável para revisar primeiro.',
        'Definir um limite simples para os próximos sete dias.',
        'Comparar o saldo projetado antes e depois do ajuste.',
      ],
      response,
    };
  }

  if (normalizedQuestion.includes('priorizar') || normalizedQuestion.includes('metas')) {
    return {
      summary: 'A prioridade agora é reduzir risco de curto prazo antes de acelerar metas de crescimento.',
      findings: [
        'Recebíveis, despesas em atenção e reserva têm mais impacto imediato.',
        'Metas continuam importantes, mas precisam respeitar o caixa disponível.',
        'Organizar prioridades reduz decisões impulsivas.',
      ],
      nextSteps: [
        'Separar o que é urgente do que é apenas importante.',
        'Proteger a reserva antes de ampliar compromissos.',
        'Escolher uma meta principal para acompanhar neste mês.',
      ],
      response,
    };
  }

  return {
    summary: 'Seu fluxo de caixa fica mais claro quando olhamos dinheiro disponível, entradas confirmadas e despesas ajustáveis ao mesmo tempo.',
    findings: [
      'A visão dos próximos sete dias é mais útil do que uma média genérica.',
      'Entradas confirmadas ajudam a diferenciar risco real de ruído momentâneo.',
      'Despesas ajustáveis podem melhorar o saldo sem comprometer o essencial.',
    ],
    nextSteps: [
      'Registrar as entradas já confirmadas.',
      'Separar despesas essenciais das ajustáveis.',
      'Revisar o saldo projetado antes de tomar decisões maiores.',
    ],
    response,
  };
}

export const thinkingSteps = [
  'Analisando seu contexto financeiro...',
  'Verificando sinais importantes...',
  'Cruzando com suas metas...',
  'Preparando uma orientação segura...',
];

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
      message: 'Estou ajustando a escuta... pode falar naturalmente.',
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
