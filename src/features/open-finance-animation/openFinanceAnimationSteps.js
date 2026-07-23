// Mocked, non-sensitive data used purely for illustrative motion.
// No real institutions, credentials, balances, or identifiers.

export const MOCK_INSTITUTIONS = [
  { id: 'inst-a', label: 'Banco A', kind: 'bank' },
  { id: 'inst-b', label: 'Banco B', kind: 'bank' },
  { id: 'inst-c', label: 'Carteira C', kind: 'wallet' },
];

export const MOCK_CATEGORIES = [
  { id: 'receitas', label: 'Receitas' },
  { id: 'despesas', label: 'Despesas' },
  { id: 'contas', label: 'Contas' },
  { id: 'cartoes', label: 'Cartões' },
  { id: 'categorias', label: 'Categorias' },
];

export const MOCK_UNI_STAGES = [
  'Organizando',
  'Comparando',
  'Identificando padrões',
  'Preparando orientações',
];

// Each step declares a relative "weight" used to derive its on-screen duration
// from the variant's total duration, so compact (~13s) and expanded (~15s)
// stay proportionally paced without duplicating timing logic.
export const ANIMATION_STEPS = [
  {
    id: 'scattered',
    index: 0,
    title: 'Contas espalhadas',
    text: 'Suas contas estão em lugares diferentes.',
    weight: 2,
  },
  {
    id: 'authorization',
    index: 1,
    title: 'Autorização segura',
    text: 'Você autoriza a conexão com segurança.',
    weight: 2,
  },
  {
    id: 'sync',
    index: 2,
    title: 'Sincronização',
    text: 'As informações chegam automaticamente.',
    weight: 2.2,
  },
  {
    id: 'organize',
    index: 3,
    title: 'Organização',
    text: 'A UniFlow organiza tudo em um só lugar.',
    weight: 2.2,
  },
  {
    id: 'intelligence',
    index: 4,
    title: 'Inteligência da Uni',
    text: 'A Uni transforma informações em clareza.',
    weight: 2.6,
  },
  {
    id: 'benefit',
    index: 5,
    title: 'Benefício final',
    text: 'Menos trabalho manual. Mais tempo para decidir.',
    weight: 2,
  },
];

export const TOTAL_WEIGHT = ANIMATION_STEPS.reduce((sum, step) => sum + step.weight, 0);

export const VARIANT_DURATIONS_MS = {
  compact: 13000,
  expanded: 15000,
};

// Returns [{ ...step, startMs, durationMs }] for a given variant.
export function getTimedSteps(variant = 'compact') {
  const total = VARIANT_DURATIONS_MS[variant] ?? VARIANT_DURATIONS_MS.compact;
  let cursor = 0;
  return ANIMATION_STEPS.map((step) => {
    const durationMs = Math.round((step.weight / TOTAL_WEIGHT) * total);
    const timed = { ...step, startMs: cursor, durationMs };
    cursor += durationMs;
    return timed;
  });
}
