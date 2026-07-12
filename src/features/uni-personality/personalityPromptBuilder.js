import { resolvePersonality } from './personalityResolver.js';

function formatPercentage(value) {
  return `${Math.round(value * 100)}%`;
}

export function buildPersonalityInstructions(input = {}) {
  const resolved = resolvePersonality(input);
  const adjustments = resolved.temporaryAdjustments.length
    ? resolved.temporaryAdjustments.join('; ')
    : 'nenhum ajuste contextual necessario';

  return [
    'IDENTIDADE CENTRAL OBRIGATORIA DA UNI',
    `Tracos fixos: ${resolved.coreIdentity.traits.join(', ')}.`,
    ...resolved.coreIdentity.rules.map((rule) => `- ${rule}`),
    '',
    `PERFIL BASE: ${resolved.profileId} (${resolved.profileLabel})`,
    `Mistura de arquetipos: elegante ${formatPercentage(resolved.archetypes.elegant)}, acolhedora ${formatPercentage(resolved.archetypes.warm)}, estrategica ${formatPercentage(resolved.archetypes.strategic)}.`,
    `Extensao: ${resolved.communication.responseLength}. Detalhe: ${resolved.communication.detailLevel}.`,
    `Vocabulario: ${resolved.communication.vocabulary}.`,
    `Acolhimento: ${formatPercentage(resolved.communication.warmth)}. Objetividade: ${formatPercentage(resolved.communication.objectivity)}.`,
    `Ajustes temporarios: ${adjustments}.`,
    '',
    'A preferencia explicita do usuario continua sendo a base.',
    'O contexto ajusta somente intensidade e forma, nunca fatos ou autonomia.',
    'Pergunte quando faltar contexto. Recomende caminhos, nunca tome a decisao.',
  ].join('\n');
}
