import { normalizeFinancialText } from '../uni-intents/index.js';
import { BRAZILIAN_FINANCIAL_INSTITUTIONS } from './brazilianFinancialInstitutions.js';

// Indices derivados do dataset (brazilianFinancialInstitutions.js) -- nunca
// uma segunda fonte de verdade paralela. Reaproveita normalizeFinancialText
// (uni-intents/intentClassifier.js: NFD + strip de acentos + lowercase +
// colapso de espacos) em vez de reimplementar essa parte.

function stripPunctuation(value) {
  return value.replace(/[.,;:!?"'()[\]{}\-_/\\|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Normalizacao completa de texto livre para comparacao com o dataset:
// trim -> lowercase -> remocao de acentos (via normalizeFinancialText) ->
// remocao de pontuacao -> normalizacao de espacos.
export function normalizeInstitutionText(value) {
  if (typeof value !== 'string') return '';
  return stripPunctuation(normalizeFinancialText(value));
}

function buildIndices() {
  const canonicalLookup = new Map();
  const aliasLookup = new Map();
  const ambiguousAliasLookup = new Map();
  const safeMatchTerms = [];

  for (const institution of BRAZILIAN_FINANCIAL_INSTITUTIONS) {
    const normalizedCanonical = normalizeInstitutionText(institution.canonicalName);
    if (normalizedCanonical && !canonicalLookup.has(normalizedCanonical)) {
      canonicalLookup.set(normalizedCanonical, institution);
    }

    for (const alias of institution.aliases ?? []) {
      const normalizedAlias = normalizeInstitutionText(alias);
      if (!normalizedAlias || aliasLookup.has(normalizedAlias)) continue;
      aliasLookup.set(normalizedAlias, { institution, alias: normalizedAlias });
      if (normalizedAlias.length >= 4) {
        safeMatchTerms.push({ institution, term: normalizedAlias });
      }
    }

    for (const alias of institution.ambiguousAliases ?? []) {
      const normalizedAlias = normalizeInstitutionText(alias);
      if (!normalizedAlias || ambiguousAliasLookup.has(normalizedAlias)) continue;
      ambiguousAliasLookup.set(normalizedAlias, { institution, alias: normalizedAlias });
    }

    if (normalizedCanonical.length >= 4) {
      safeMatchTerms.push({ institution, term: normalizedCanonical });
    }
  }

  // Termos mais longos primeiro -- evita que um termo curto contido dentro
  // de um termo mais especifico "vença" por acaso (ex.: nunca deixar "pay"
  // interferir quando "google pay" já é o termo correto mais longo).
  safeMatchTerms.sort((left, right) => right.term.length - left.term.length);

  return {
    canonicalLookup, aliasLookup, ambiguousAliasLookup, safeMatchTerms,
  };
}

export const {
  canonicalLookup: CANONICAL_INSTITUTION_LOOKUP,
  aliasLookup: INSTITUTION_ALIAS_LOOKUP,
  ambiguousAliasLookup: AMBIGUOUS_INSTITUTION_ALIAS_LOOKUP,
  safeMatchTerms: SAFE_INSTITUTION_MATCH_TERMS,
} = buildIndices();
