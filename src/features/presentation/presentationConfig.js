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

export const PRESENTATION_SLIDES = Object.freeze([
  Object.freeze({
    id: 'welcome',
    title: 'Bem-vindo à UniFlow AI',
    description: 'Sua jornada para uma vida financeira mais organizada começa agora.',
    artwork: 'welcome',
    primaryAction: 'COMEÇAR',
  }),
  Object.freeze({
    id: 'everything',
    title: 'Tudo o que você precisa, em um só lugar',
    description:
      'Centralize suas finanças, converse com a Uni e acompanhe tudo em um único aplicativo.',
    artwork: 'dashboard',
    primaryAction: 'PRÓXIMO',
    skipAction: 'PULAR',
  }),
  Object.freeze({
    id: 'security',
    title: 'Segurança, privacidade e tecnologia de ponta',
    description:
      'Seus dados são protegidos e organizados com segurança para que você tenha tranquilidade.',
    artwork: 'security',
    primaryAction: 'COMEÇAR AGORA',
    skipAction: 'PULAR',
  }),
]);
