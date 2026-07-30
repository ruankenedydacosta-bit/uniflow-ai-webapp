export const PERSONAL_PLAN_ROUTE = '/plano-pessoal';
// BLOCO ASAAS CHECKOUT: rota de retorno do Asaas Checkout hospedado
// (cartão) -- fonte única, nunca uma string hardcoded duplicada em
// routes.jsx/App.jsx/PersonalPlanPage.jsx/PersonalPlanReturnPage.jsx.
export const PERSONAL_PLAN_RETURN_ROUTE = `${PERSONAL_PLAN_ROUTE}/retorno`;
export const PERSONAL_PLAN_ID = 'personal';
// ETAPA 4: fonte única do preço exibido -- reaproveitado pelo card do plano
// em Conta (SimplifiedAccountPage.jsx), nunca reescrito lá.
export const PERSONAL_PLAN_PRICE_LABEL = 'R$ 29,90';
export const PERSONAL_PLAN_PRICE_PERIOD = '/mês';

export const PERSONAL_PLAN_BENEFITS = Object.freeze([
  Object.freeze({
    id: 'voice',
    title: 'Registrar por voz',
    description: 'Fale com a Uni e registre gastos e receitas.',
  }),
  Object.freeze({
    id: 'categories',
    title: 'Categorias inteligentes',
    description: 'Organização automática.',
  }),
  Object.freeze({
    id: 'uni',
    title: 'Pergunte à Uni',
    lines: Object.freeze([
      'Consultar saldo.',
      'Consultar histórico.',
      'Consultar gastos.',
      'Tudo por voz ou texto.',
    ]),
  }),
  Object.freeze({
    id: 'history',
    title: 'Histórico completo',
    description: 'Todos os registros.',
  }),
  Object.freeze({
    id: 'summary',
    title: 'Resumo mensal',
    lines: Object.freeze(['Entrou', 'Saiu', 'Saldo']),
  }),
  Object.freeze({
    id: 'accounts',
    title: 'Controle de contas',
    lines: Object.freeze(['Contas bancárias.', 'Saldo.', 'Organização.']),
  }),
]);

export const PERSONAL_PLAN_TRUST_SEALS = Object.freeze([
  Object.freeze({ id: 'protected', label: 'Dados protegidos' }),
  Object.freeze({ id: 'technology', label: 'Tecnologia segura' }),
  Object.freeze({ id: 'support', label: 'Suporte humano' }),
  Object.freeze({ id: 'simple', label: 'Feito para facilitar sua vida' }),
]);

