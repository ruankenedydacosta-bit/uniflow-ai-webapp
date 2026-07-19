export const AUTH_MODES = Object.freeze({
  SIGN_IN: 'signin',
  SIGN_UP: 'signup',
});

export const SOCIAL_PROVIDERS = Object.freeze({
  GOOGLE: 'google',
  APPLE: 'apple',
});

export const WELCOME_SLIDES = Object.freeze([
  Object.freeze({
    id: 'clarity',
    title: 'Entenda sua vida financeira',
    description: 'Veja sua situação com clareza e saiba o que merece sua atenção.',
    visualLabel: 'Clareza financeira',
  }),
  Object.freeze({
    id: 'conversation',
    title: 'Converse com a Uni',
    description: 'Registre informações, tire dúvidas e receba orientações de forma simples.',
    visualLabel: 'Conversa simples',
  }),
  Object.freeze({
    id: 'future',
    title: 'Organize hoje. Visualize o futuro.',
    description: 'Acompanhe tendências, metas e próximos passos em um só lugar.',
    visualLabel: 'Próximos passos',
  }),
]);

export function normalizeAuthMode(value) {
  return value === AUTH_MODES.SIGN_UP ? AUTH_MODES.SIGN_UP : AUTH_MODES.SIGN_IN;
}

export function getNextSlideIndex(index, direction, total = WELCOME_SLIDES.length) {
  const safeTotal = Number.isInteger(total) && total > 0 ? total : 1;
  const safeIndex = Number.isInteger(index) ? Math.min(Math.max(index, 0), safeTotal - 1) : 0;
  return Math.min(Math.max(safeIndex + Math.sign(direction || 0), 0), safeTotal - 1);
}

export function getSocialUnavailableResult(provider) {
  const name = provider === SOCIAL_PROVIDERS.APPLE ? 'Apple' : 'Google';
  return Object.freeze({
    available: false,
    provider: provider === SOCIAL_PROVIDERS.APPLE
      ? SOCIAL_PROVIDERS.APPLE
      : SOCIAL_PROVIDERS.GOOGLE,
    message: `Login com ${name} estará disponível em breve.`,
  });
}
