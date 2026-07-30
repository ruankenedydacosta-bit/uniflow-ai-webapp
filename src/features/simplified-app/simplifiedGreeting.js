function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function firstName(value) {
  return cleanName(value).split(' ')[0] || '';
}

export function resolveSimplifiedGreeting(profile, user) {
  const explicitName = cleanName(
    profile?.preferred_name
    ?? profile?.display_name
    ?? profile?.nickname,
  );
  const resolvedName = explicitName
    || firstName(profile?.full_name)
    || firstName(user?.user_metadata?.full_name)
    || 'você';

  const explicitSalutation = cleanName(
    profile?.preferred_salutation
    ?? profile?.salutation,
  );
  const safeSalutation = ['Sr.', 'Sra.'].includes(explicitSalutation)
    ? explicitSalutation
    : '';

  return Object.freeze({
    name: resolvedName,
    hasKnownName: resolvedName !== 'você',
    salutation: safeSalutation,
    heading: safeSalutation
      ? `${safeSalutation} ${resolvedName}`
      : resolvedName === 'você' ? 'Olá' : `Olá, ${resolvedName}`,
    voiceText: resolvedName === 'você'
      ? 'Seja bem-vindo. Estou pronta para ajudar.'
      : `Seja bem-vindo, ${resolvedName}. Estou pronta para ajudar.`,
  });
}

