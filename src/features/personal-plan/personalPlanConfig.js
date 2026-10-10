export const PERSONAL_PLAN_ROUTE = '/plano-pessoal';
// BLOCO ASAAS CHECKOUT: rota de retorno do Asaas Checkout hospedado
// (cartão) -- fonte única, nunca uma string hardcoded duplicada em
// routes.jsx/App.jsx/PersonalPlanPage.jsx/PersonalPlanReturnPage.jsx.
export const PERSONAL_PLAN_RETURN_ROUTE = `${PERSONAL_PLAN_ROUTE}/retorno`;
export const PERSONAL_PLAN_ID = 'personal';
import {
  DEFAULT_SUBSCRIPTION_TIER_ID,
  findSubscriptionTier,
  SUBSCRIPTION_TIERS,
} from '../../services/billingTypes.js';

// Preço em reais no formato da tela: 29.9 -> 'R$ 29,90'.
export function formatPlanPrice(valueBrl) {
  const value = Number(valueBrl);
  if (!Number.isFinite(value)) return '';
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

// Épico #116: três níveis do Plano Pessoal, com cota de conversa por voz.
// Preço e minutos vêm de SUBSCRIPTION_TIERS (espelho de subscription_tiers).
export const PERSONAL_PLAN_TIERS = Object.freeze(SUBSCRIPTION_TIERS.map((tier) => Object.freeze({
  ...tier,
  priceLabel: formatPlanPrice(tier.priceBrl),
  voiceMinutesLabel: `${tier.voiceMinutes} minutos de conversa por voz por mês`,
})));

export const DEFAULT_PERSONAL_PLAN_TIER_ID = DEFAULT_SUBSCRIPTION_TIER_ID;

export function findPersonalPlanTier(tierId) {
  const tier = findSubscriptionTier(tierId) ? tierId : DEFAULT_PERSONAL_PLAN_TIER_ID;
  return PERSONAL_PLAN_TIERS.find((item) => item.id === tier);
}

// ETAPA 4: fonte única do preço exibido -- reaproveitado pelo card do plano
// em Conta (SimplifiedAccountPage.jsx), nunca reescrito lá. É o preço do
// nível padrão (Uni Voz, R$ 29,90); telas de quem já assina mostram o valor
// da própria assinatura quando ele existe.
export const PERSONAL_PLAN_PRICE_LABEL = findPersonalPlanTier(DEFAULT_PERSONAL_PLAN_TIER_ID).priceLabel;
export const PERSONAL_PLAN_PRICE_PERIOD = '/mês';

// REDESIGN APP-LIKE: lista enxuta de recursos -- um por linha (ícone +
// título + uma descrição curta). Todos os itens têm a MESMA forma
// (`description`, nunca `lines`), porque a lista nativa mostra exatamente
// uma linha de apoio por recurso; blocos com bullets eram o que dava à
// página o aspecto de landing page de venda. Tela 21d: `tone` é a cor da
// marca do ícone.
export const PERSONAL_PLAN_BENEFITS = Object.freeze([
  Object.freeze({
    id: 'voice',
    title: 'Registros por voz',
    description: 'Registre entradas e saídas falando com a Uni.',
    tone: 'violet',
  }),
  Object.freeze({
    id: 'categories',
    title: 'Categorias inteligentes',
    description: 'Seus registros são organizados por categoria.',
    tone: 'blue',
  }),
  Object.freeze({
    id: 'uni',
    title: 'Converse com a Uni',
    description: 'Consulte suas informações por voz ou texto.',
    tone: 'violet',
  }),
  Object.freeze({
    id: 'agenda',
    title: 'Agenda integrada',
    description: 'Organize seus compromissos com a Uni.',
    tone: 'blue',
  }),
  Object.freeze({
    id: 'summary',
    title: 'Resumo financeiro',
    description: 'Veja o que entrou e o que saiu no mês.',
    tone: 'green',
  }),
  Object.freeze({
    id: 'history',
    title: 'Histórico completo',
    description: 'Consulte todos os seus registros.',
    tone: 'green',
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
