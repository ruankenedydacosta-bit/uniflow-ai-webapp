function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const homeMobileMock = deepFreeze({
  briefing: {
    eyebrow: 'Uni Briefing',
    message:
      'Você está em uma rota saudável. Se continuar nesse ritmo, sua reserva estará completa em 4 meses.',
    actionLabel: 'Ver detalhes',
  },
  nextStep: {
    title: 'Organizar cartões pendentes',
    actionLabel: 'Fazer agora',
  },
  summary: [
    { id: 'balance', label: 'Saldo', value: 'R$ 4.230', hasData: true },
    { id: 'income', label: 'Receita', value: 'R$ 6.500', hasData: true },
    { id: 'expense', label: 'Despesa', value: 'R$ 2.270', hasData: true },
    { id: 'reserve', label: 'Reserva', value: 'R$ 1.800', hasData: true },
  ],
  goals: [
    { id: 'emergency', title: 'Reserva de emergência', progress: 70 },
    { id: 'travel', title: 'Viagem em dezembro', progress: 30 },
  ],
  insights: [
    { id: 'spending', icon: '!', label: 'Gastos subiram esta semana', tone: 'warning' },
    { id: 'due-date', icon: '7', label: 'Uma conta vence em breve', tone: 'neutral' },
    { id: 'goal', icon: '↑', label: 'Sua meta segue avançando', tone: 'success' },
    { id: 'saving', icon: '✓', label: 'Há espaço para economizar', tone: 'info' },
  ],
  quickActions: [
    { id: 'expense', icon: '−', label: 'Nova despesa', path: '/financeiro' },
    { id: 'income', icon: '+', label: 'Nova receita', path: '/financeiro' },
    { id: 'uni', icon: 'U', label: 'Falar com a Uni', path: '/uni-ai' },
    { id: 'finance', icon: '↗', label: 'Ver Financeiro', path: '/financeiro' },
  ],
});
