import { PERSONAL_PLAN_ROUTE } from '../personal-plan/personalPlanConfig.js';

export const PRESENTATION_ROUTE = '/apresentacao';

export const PRESENTATION_NEXT_ROUTE = PERSONAL_PLAN_ROUTE;

export const PRESENTATION_REPLAY_STATE = 'replayPresentation';
export const PRESENTATION_DEMO_USER_ID = 'demo-user';

export function resolvePresentationUserId(session, isSupabaseConfigured) {
  if (!isSupabaseConfigured) return PRESENTATION_DEMO_USER_ID;
  return typeof session?.user?.id === 'string' && session.user.id
    ? session.user.id
    : null;
}

// Tela 21a–c: botões em caixa normal e a arte feita com peças do app (orb da
// Uni, card de rascunho com item da agenda e o escudo).
export const PRESENTATION_SLIDES = Object.freeze([
  Object.freeze({
    id: 'welcome',
    title: 'Bem-vindo à UniFlow AI',
    description: 'Organize sua vida financeira conversando com a Uni, por voz ou texto.',
    artwork: 'orb',
    primaryAction: 'Começar',
  }),
  Object.freeze({
    id: 'everything',
    title: 'Tudo em um só lugar',
    description:
      'Registre entradas e saídas, acompanhe sua agenda e converse com a Uni no mesmo app.',
    artwork: 'pieces',
    primaryAction: 'Próximo',
    skipAction: 'Pular',
  }),
  Object.freeze({
    id: 'security',
    title: 'Seus dados protegidos',
    description: 'Suas informações financeiras ficam guardadas com segurança.',
    artwork: 'shield',
    primaryAction: 'Começar agora',
    skipAction: 'Pular',
  }),
]);
