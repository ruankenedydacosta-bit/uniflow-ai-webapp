const COPY = Object.freeze({
  balanced: ({ field, value }) =>
    `Usei sua preferência anterior para definir ${field} como ${value}.`,
  direct: ({ field, value }) =>
    `${field.charAt(0).toUpperCase()}${field.slice(1)} definida pela sua preferência: ${value}.`,
  warm: ({ field, value }) =>
    `Lembrei da sua escolha anterior e coloquei ${field} como ${value}.`,
  strategic: ({ field, value }) =>
    `Defini ${field} como ${value} com base no mapeamento que você confirmou anteriormente.`,
});

export function buildMemoryInfluenceExplanation(influences, profileId = 'balanced') {
  const influence = Array.isArray(influences) ? influences[0] : null;
  if (!influence) return '';
  const builder = COPY[profileId] ?? COPY.balanced;
  return builder({
    field: influence.field === 'account' ? 'a conta' : 'a categoria',
    value: influence.label,
  });
}

export function buildMemoryConflictExplanation(conflict) {
  if (!conflict) return '';
  return conflict.field === 'account'
    ? `Você quer usar ${conflict.memoryLabel}, como da última vez, ou ${conflict.currentLabel} nesta ocasião?`
    : `Você quer usar ${conflict.memoryLabel}, como da última vez, ou ${conflict.currentLabel} nesta ocasião?`;
}
