function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function firstName(value) {
  return cleanName(value).split(' ')[0] || '';
}

const TREATMENT_RULES = Object.freeze({
  voce: Object.freeze({ label: '', welcome: 'Boas-vindas' }),
  senhor: Object.freeze({ label: 'senhor', welcome: 'Seja bem-vindo' }),
  senhora: Object.freeze({ label: 'senhora', welcome: 'Seja bem-vinda' }),
  senhorita: Object.freeze({ label: 'senhorita', welcome: 'Seja bem-vinda' }),
  doutor: Object.freeze({ label: 'doutor', welcome: 'Seja bem-vindo' }),
  doutora: Object.freeze({ label: 'doutora', welcome: 'Seja bem-vinda' }),
  prefer_not_to_say: Object.freeze({ label: '', welcome: 'Boas-vindas' }),
  other: Object.freeze({ label: '', welcome: 'Boas-vindas' }),
});

function resolveTreatment(profile) {
  const preference = cleanName(profile?.treatment_preference).toLowerCase();
  const rule = TREATMENT_RULES[preference] ?? TREATMENT_RULES.voce;
  const customTreatment = preference === 'other'
    ? cleanName(profile?.custom_treatment)
    : '';
  const treatmentLabel = customTreatment && customTreatment.length <= 40
    ? customTreatment.toLocaleLowerCase('pt-BR')
    : rule.label;

  return Object.freeze({
    preference: Object.hasOwn(TREATMENT_RULES, preference) ? preference : 'voce',
    treatmentLabel,
    visualGreeting: rule.welcome,
  });
}

export function resolveUserDisplayName(profile, user) {
  return cleanName(profile?.preferred_name)
    || firstName(profile?.full_name)
    || firstName(user?.user_metadata?.full_name)
    || firstName(user?.user_metadata?.name)
    || firstName(user?.name)
    || 'você';
}

export function resolveSimplifiedGreeting(profile, user) {
  const displayName = resolveUserDisplayName(profile, user);
  const treatment = resolveTreatment(profile);
  const addressedName = treatment.treatmentLabel
    ? `${treatment.treatmentLabel} ${displayName}`
    : displayName;
  const visualGreeting = Object.freeze({
    eyebrow: `${treatment.visualGreeting},`,
    name: displayName,
  });
  const spokenGreeting = `${treatment.visualGreeting}, ${addressedName}.`;

  return Object.freeze({
    displayName,
    treatmentLabel: treatment.treatmentLabel,
    addressedName,
    visualGreeting,
    spokenGreeting,
    name: displayName,
    hasKnownName: displayName !== 'você',
    salutation: treatment.treatmentLabel,
    heading: addressedName,
    voiceText: spokenGreeting,
  });
}
