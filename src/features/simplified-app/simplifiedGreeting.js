function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function firstName(value) {
  return cleanName(value).split(' ')[0] || '';
}

// Tratamento escolhido no perfil. Entra só na fala, antes do nome.
const TREATMENT_LABELS = Object.freeze({
  voce: '',
  senhor: 'senhor',
  senhora: 'senhora',
  senhorita: 'senhorita',
  doutor: 'doutor',
  doutora: 'doutora',
  prefer_not_to_say: '',
  other: '',
});

function resolveTreatmentLabel(profile) {
  const preference = cleanName(profile?.treatment_preference).toLowerCase();
  const customTreatment = preference === 'other'
    ? cleanName(profile?.custom_treatment)
    : '';
  if (customTreatment && customTreatment.length <= 40) {
    return customTreatment.toLocaleLowerCase('pt-BR');
  }
  return TREATMENT_LABELS[preference] ?? '';
}

// Aberturas da saudação. A tela mostra só a abertura e o nome; a fala
// completa a frase como uma secretária que já se coloca à disposição.
// Nenhuma frase presume o gênero de quem ouve ("pronta" e "comigo" são da Uni).
export const GREETING_OPENINGS = Object.freeze({
  PERIODO: 'periodo',
  OI: 'oi',
  OLA: 'ola',
  TUDO_BEM: 'tudo_bem',
  QUE_BOM: 'que_bom',
});

const GREETING_OPENING_IDS = Object.freeze(Object.values(GREETING_OPENINGS));

const PERIOD_GREETINGS = Object.freeze({
  manha: Object.freeze({ opening: 'Bom dia', mark: '!', followUp: 'Vamos deixar o dia em ordem?' }),
  tarde: Object.freeze({ opening: 'Boa tarde', mark: '!', followUp: 'No que posso ajudar agora?' }),
  noite: Object.freeze({ opening: 'Boa noite', mark: '!', followUp: 'Quer fechar o dia comigo?' }),
});

const OPENING_GREETINGS = Object.freeze({
  [GREETING_OPENINGS.OI]: Object.freeze({ opening: 'Oi', mark: '!', followUp: 'Tudo pronto por aqui.' }),
  [GREETING_OPENINGS.OLA]: Object.freeze({ opening: 'Olá', mark: '!', followUp: 'No que vamos trabalhar hoje?' }),
  [GREETING_OPENINGS.TUDO_BEM]: Object.freeze({ opening: 'Tudo bem', mark: '?', followUp: 'Estou aqui pro que precisar.' }),
  [GREETING_OPENINGS.QUE_BOM]: Object.freeze({ opening: 'Que bom te ver', mark: '!', followUp: '' }),
});

function greetingForHour(hour) {
  if (hour >= 5 && hour < 12) return PERIOD_GREETINGS.manha;
  if (hour >= 12 && hour < 18) return PERIOD_GREETINGS.tarde;
  return PERIOD_GREETINGS.noite;
}

function resolveGreetingParts(opening, hour) {
  if (opening === GREETING_OPENINGS.PERIODO) return greetingForHour(hour);
  return OPENING_GREETINGS[opening] ?? OPENING_GREETINGS[GREETING_OPENINGS.QUE_BOM];
}

export function pickGreetingOpening({ random = Math.random, now = new Date() } = {}) {
  const index = Math.min(
    GREETING_OPENING_IDS.length - 1,
    Math.floor(random() * GREETING_OPENING_IDS.length),
  );
  return Object.freeze({ opening: GREETING_OPENING_IDS[index], hour: now.getHours() });
}

// Sorteada uma vez por carga de página: navegar e voltar à Home mantém a
// mesma saudação, e só um refresh troca.
let pageLoadGreetingOpening = null;

export function getPageLoadGreetingOpening() {
  pageLoadGreetingOpening ??= pickGreetingOpening();
  return pageLoadGreetingOpening;
}

export function resolveUserDisplayName(profile, user) {
  return cleanName(profile?.preferred_name)
    || firstName(profile?.full_name)
    || firstName(user?.user_metadata?.full_name)
    || firstName(user?.user_metadata?.name)
    || firstName(user?.name)
    || 'você';
}

export function resolveSimplifiedGreeting(
  profile,
  user,
  { opening = GREETING_OPENINGS.QUE_BOM, hour = new Date().getHours() } = {},
) {
  const displayName = resolveUserDisplayName(profile, user);
  const hasKnownName = displayName !== 'você';
  const treatmentLabel = resolveTreatmentLabel(profile);
  const addressedName = treatmentLabel
    ? `${treatmentLabel} ${displayName}`
    : displayName;
  const parts = resolveGreetingParts(opening, hour);
  const visualGreeting = Object.freeze({
    eyebrow: `${parts.opening},`,
    name: displayName,
  });
  // Sem nome conhecido a fala não chama a pessoa de "você".
  const salutation = hasKnownName
    ? `${parts.opening}, ${addressedName}${parts.mark}`
    : `${parts.opening}${parts.mark}`;
  const spokenGreeting = parts.followUp ? `${salutation} ${parts.followUp}` : salutation;

  return Object.freeze({
    displayName,
    treatmentLabel,
    addressedName,
    visualGreeting,
    spokenGreeting,
    name: displayName,
    hasKnownName,
    salutation: treatmentLabel,
    heading: addressedName,
    voiceText: spokenGreeting,
  });
}
