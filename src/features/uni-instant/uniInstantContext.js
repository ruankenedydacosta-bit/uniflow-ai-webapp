const CONTEXTS = Object.freeze({
  '/dashboard': Object.freeze({
    label: 'Home',
    type: 'financial_action',
    transcript: 'Comprei um arroz de 25 reais no supermercado pelo Nubank.',
    response: 'Registrar saída de R$ 25,00 em Mercado, paga pelo Nubank?',
  }),
  '/financeiro': Object.freeze({
    label: 'Financeiro',
    type: 'question',
    transcript: 'Quanto gastei com alimentação este mês?',
    response: 'Você gastou R$ 940,00 com alimentação neste mês.',
  }),
  '/agenda': Object.freeze({
    label: 'Agenda',
    type: 'question',
    transcript: 'Qual é o meu próximo compromisso?',
    response: 'Você tem uma reunião com Carlos às 16h.',
  }),
});

const FALLBACK_CONTEXT = Object.freeze({
  label: 'Tela atual',
  type: 'question',
  transcript: 'Como você pode me ajudar aqui?',
  response: 'Posso ajudar com o contexto desta tela.',
});

export function resolveUniInstantContext(pathname = '') {
  return CONTEXTS[pathname] ?? FALLBACK_CONTEXT;
}

export { CONTEXTS as UNI_INSTANT_CONTEXTS };
