import {
  AMBIGUOUS_INSTITUTION_ALIAS_LOOKUP,
  CANONICAL_INSTITUTION_LOOKUP,
  INSTITUTION_ALIAS_LOOKUP,
  normalizeInstitutionText,
  SAFE_INSTITUTION_MATCH_TERMS,
} from './financialInstitutionAliases.js';

// BLOCO NORMALIZACAO DE INSTITUICOES: camada 100% determinística/offline
// (NUNCA chama a OpenAI) que resolve variações de transcrição de voz de
// bancos/fintechs/carteiras digitais brasileiras para um nome canônico,
// ANTES de qualquer resolução de conta ou proposta de criação. Corrige o
// caso real: "Gastei 50 reais no mercado e foi no Nubank" transcrito como
// "...e foi no No Bank" -- sem essa camada, o app tentaria criar uma conta
// chamada "No Bank" em vez de reconhecer a conta real "Nubank".
//
// `hasAccountContext` (default false): quando true, o chamador está
// atestando que este texto já chegou a um ponto de resolução de conta
// (resolveFinancialAccount, correção de conta pendente, source/destination
// de um financial_plan) -- só então termos curtos e ambíguos ("caixa",
// "inter", "bb", "will", "next", ...) são normalizados. Sem esse sinal,
// eles nunca viram banco, mesmo aparecendo isolados na base de aliases.

const MIN_FUZZY_INPUT_LENGTH = 4;
const MIN_FUZZY_TERM_LENGTH = 4;

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 0; i < a.length; i += 1) {
    const currentRow = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      const insertCost = currentRow[j] + 1;
      const deleteCost = previousRow[j + 1] + 1;
      const substituteCost = previousRow[j] + (a[i] === b[j] ? 0 : 1);
      currentRow.push(Math.min(insertCost, deleteCost, substituteCost));
    }
    previousRow = currentRow;
  }

  return previousRow[b.length];
}

function maxAllowedDistance(termLength) {
  if (termLength <= 6) return 1;
  return 2;
}

function buildResult({
  original, normalizedInput, institution, matchedAlias, matchType, confidence,
}) {
  return Object.freeze({
    original,
    normalizedInput,
    canonicalName: institution.canonicalName,
    institutionType: institution.institutionType,
    confidence,
    matchType,
    matchedAlias,
  });
}

function emptyResult(original, normalizedInput) {
  return Object.freeze({
    original,
    normalizedInput,
    canonicalName: null,
    institutionType: null,
    confidence: 0,
    matchType: null,
    matchedAlias: null,
  });
}

function findContainedAliasMatch(normalizedInput) {
  for (const { institution, term } of SAFE_INSTITUTION_MATCH_TERMS) {
    if (term === normalizedInput) continue; // já coberto pelas etapas exact/alias
    const pattern = new RegExp(`(?:^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'u');
    if (pattern.test(` ${normalizedInput} `)) {
      return { institution, matchedAlias: term };
    }
  }
  return null;
}

function findFuzzyMatch(normalizedInput) {
  if (normalizedInput.length < MIN_FUZZY_INPUT_LENGTH) return null;

  let best = null;
  let ambiguousTie = false;

  for (const { institution, term } of SAFE_INSTITUTION_MATCH_TERMS) {
    if (term.length < MIN_FUZZY_TERM_LENGTH) continue;
    if (Math.abs(term.length - normalizedInput.length) > maxAllowedDistance(term.length)) continue;
    if (term[0] !== normalizedInput[0]) continue; // guarda conservadora extra

    const distance = levenshteinDistance(normalizedInput, term);
    if (distance > maxAllowedDistance(term.length)) continue;

    if (!best || distance < best.distance) {
      best = {
        institution, matchedAlias: term, distance,
      };
      ambiguousTie = false;
    } else if (distance === best.distance && best.institution.canonicalName !== institution.canonicalName) {
      // Duas instituições diferentes empatam na mesma distância -- fuzzy
      // conservador nunca escolhe uma delas "no palpite".
      ambiguousTie = true;
    }
  }

  if (!best || ambiguousTie) return null;
  return best;
}

/**
 * Normaliza texto livre (tipicamente uma transcrição de voz ou uma
 * referência de conta já extraída) para o nome canônico de uma instituição
 * financeira brasileira conhecida, quando aplicável.
 *
 * Nunca lança, nunca chama rede/IA, nunca inventa uma instituição --
 * `canonicalName` só é preenchido quando há correspondência real no
 * dataset (exata, alias, contida ou fuzzy conservador).
 */
export function normalizeFinancialInstitutionName(rawText, { hasAccountContext = false } = {}) {
  const original = typeof rawText === 'string' ? rawText : '';
  const normalizedInput = normalizeInstitutionText(original);

  if (!normalizedInput) return emptyResult(original, normalizedInput);

  const canonicalMatch = CANONICAL_INSTITUTION_LOOKUP.get(normalizedInput);
  if (canonicalMatch) {
    // Algumas instituicoes (Next, Stone, Ton, Wise, Nomad, Rico, Clear,
    // Toro, XP, iti) tem o proprio nome canonico igual a uma palavra comum
    // e ambigua -- mesmo sendo uma correspondencia "exata", ainda exige
    // contexto de conta, igual a qualquer outro alias ambiguo.
    const isSelfAmbiguous = AMBIGUOUS_INSTITUTION_ALIAS_LOOKUP.has(normalizedInput);
    if (isSelfAmbiguous && !hasAccountContext) return emptyResult(original, normalizedInput);
    return buildResult({
      original,
      normalizedInput,
      institution: canonicalMatch,
      matchedAlias: normalizedInput,
      matchType: 'exact',
      confidence: 1,
    });
  }

  const aliasMatch = INSTITUTION_ALIAS_LOOKUP.get(normalizedInput);
  if (aliasMatch) {
    return buildResult({
      original,
      normalizedInput,
      institution: aliasMatch.institution,
      matchedAlias: aliasMatch.alias,
      matchType: 'alias',
      confidence: 0.95,
    });
  }

  const ambiguousMatch = AMBIGUOUS_INSTITUTION_ALIAS_LOOKUP.get(normalizedInput);
  if (ambiguousMatch) {
    if (!hasAccountContext) return emptyResult(original, normalizedInput);
    return buildResult({
      original,
      normalizedInput,
      institution: ambiguousMatch.institution,
      matchedAlias: ambiguousMatch.alias,
      matchType: 'alias',
      confidence: 0.7,
    });
  }

  const containedMatch = findContainedAliasMatch(normalizedInput);
  if (containedMatch) {
    return buildResult({
      original,
      normalizedInput,
      institution: containedMatch.institution,
      matchedAlias: containedMatch.matchedAlias,
      matchType: 'normalized',
      confidence: 0.85,
    });
  }

  const fuzzyMatch = findFuzzyMatch(normalizedInput);
  if (fuzzyMatch) {
    return buildResult({
      original,
      normalizedInput,
      institution: fuzzyMatch.institution,
      matchedAlias: fuzzyMatch.matchedAlias,
      matchType: 'fuzzy',
      confidence: fuzzyMatch.distance === 0 ? 0.9 : 0.65,
    });
  }

  return emptyResult(original, normalizedInput);
}
