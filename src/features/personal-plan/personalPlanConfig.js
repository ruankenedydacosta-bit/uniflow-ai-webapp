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

// REDESIGN APP-LIKE: lista enxuta de recursos -- um por linha (ícone +
// título + uma descrição curta). Todos os itens têm a MESMA forma
// (`description`, nunca `lines`), porque a lista nativa mostra exatamente
// uma linha de apoio por recurso; blocos com bullets eram o que dava à
// página o aspecto de landing page de venda.
export const PERSONAL_PLAN_BENEFITS = Object.freeze([
  Object.freeze({
    id: 'voice',
    title: 'Registros por voz',
    description: 'Registre entradas e saídas falando com a Uni.',
  }),
  Object.freeze({
    id: 'categories',
    title: 'Categorias inteligentes',
    description: 'Organização automática dos seus registros.',
  }),
  Object.freeze({
    id: 'uni',
    title: 'Converse com a Uni',
    description: 'Consulte suas informações por voz ou texto.',
  }),
  Object.freeze({
    id: 'agenda',
    title: 'Agenda integrada',
    description: 'Organize seus compromissos com a Uni.',
  }),
  Object.freeze({
    id: 'summary',
    title: 'Resumo financeiro',
    description: 'Veja rapidamente o que entrou e o que saiu.',
  }),
  Object.freeze({
    id: 'history',
    title: 'Histórico completo',
    description: 'Seus registros organizados em um só lugar.',
  }),
]);

// A demonstração "Você fala. A Uni organiza." é 100% estática: nenhum
// request, nenhuma chamada à Uni Engine, nenhum dado real do usuário.
// Fica aqui para nunca ser confundida com um lançamento de verdade.
export const PERSONAL_PLAN_VOICE_DEMO = Object.freeze({
  utterance: 'Uni, gastei R$ 80 no mercado.',
  direction: 'Saída',
  category: 'Alimentação',
  amount: 'R$ 80,00',
});
