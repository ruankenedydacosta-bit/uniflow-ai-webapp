// CAMADA pt-BR COLOQUIAL (Agenda/Uni) -- PONTO DE EXTENSÃO oficial para a
// futura `src/features/uni-language/pt-br/`.
//
// Regras desta fase (NÃO criar dicionário gigante hardcoded agora):
// - Só o suficiente para os intents de Agenda/lembrete aceitarem português
//   brasileiro coloquial real (gírias, regionalismos, reduções de voz);
// - O texto original/transcrição NUNCA é alterado: a normalização aqui é
//   uma representação AUXILIAR, aplicada sobre o texto já NORMALIZADO do
//   classificador (que recebe cópias via normalizeFinancialText). O
//   chamador continua guardando a frase original para o contexto da
//   conversa;
// - A futura camada versionada em src/features/uni-language/pt-br/
//   (aliases semânticos, variações regionais, abreviações, erros comuns de
//   transcrição por voz, equivalência a conceitos canônicos + suíte própria)
//   DEVE plugar exatamente aqui: substituir a implementação destes
//   expositores sem mudar a assinatura pública (stripColloquialLead /
//   hasAgendaVagueSubject / buildAgendaReminderPatterns /
//   buildAgendaSchedulePatterns);
// - NUNCA inferir a região do usuário por gíria: a camada apenas aceita
//   variantes; ela não "geolocaliza" o usuário.

// Interjeições/gírias brasileiras frequentes no começo de frases faladas.
// Remover o prefixo coloquial melhora a robustez dos padrões sem perder o
// significado -- e nunca chega ao usuário (representação auxiliar apenas).
export const PT_BR_COLLOQUIAL_INTERJECTIONS = Object.freeze([
  'bah',
  'uai',
  'oxe',
  'oxente',
  'mano',
  'po',
  'cara',
  'rapaz',
  'visse',
  'capaz',
  'bora',
  'vamo',
]);

// Frases curtas faladas que pedem LEMBRETE -- "me lembra", "me avisa",
// "me dá um toque", "não deixa eu esquecer". Operam sobre o texto já
// NORMALIZADO (minúsculo, sem acentos).
export const PT_BR_REMINDER_COLLOQUIALS = Object.freeze([
  /\b(?:me\s+)?avis(?:a|ar|e)\b/,
  /\b(?:me\s+)?d[aá]\s+um\s+toque\b/,
  /\bnao\s+deixa\s+eu\s+esquecer\b/,
]);

// Locuções coloquiais que disparam criar compromisso/agenda -- SOMENTE
// quando NÃO houver valor monetário explícito na frase (senão são os
// lançamentos financeiros "anota aí 50 reais" que devem ganhar).
export const PT_BR_SCHEDULE_COLLOQUIALS = Object.freeze([
  /\bbota\s+(?:na|em|no)\s+(?:minha\s+)?agenda\b/,
  // "bota [X...] pra/para [tempo]" -- o lookahead vinha de DEPOIS de
  // "pra", deixando escapar "bota 50 reais pra amanhã" (dinheiro antes do
  // "pra"). Olhar bloqueador agora parte do verbo (detalhe da frase toda):
  // a presença de valor monetário em QUALQUER ponto desqualifica o
  // agendamento e a frase segue para as regras financeiras.
  /\bbota\b(?=[\s\S]*?\b(?:pra|para)\b)(?![\s\S]*\b(?:r[eé]ais?|r\s*\$|\d)\b)/,
  /\bmarca\b(?=[\s\S]*?\b(?:pra|para)\b)(?![\s\S]*\b(?:r[eé]ais?|r\s*\$|\d)\b)/,
  /\b(?:anota|marca)\s+ai\b(?![\s\S]*\b(?:r[eé]ais?|r\s*\$|\d)\b)/,
  /\bmarca\s+(?:uma\s+|um\s+|na\s+)?(?:reuniao|compromisso|consulta|dentista|evento|negocio)\b/,
  /\b(?:tenho|tive|vou\s+ter)\s+(?:um\s+|uma\s+|uns\s+|umas\s+)?(?:negocio|compromisso|reuniao|dentista|consulta|evento|entrevista)\b/,
  /\bdaqui\s+(?:a\s+|uns\s+|umas\s+|cerca\s+de\s+)?(?:\d{1,3}|uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|vinte|trinta)\s+(?:dia|dias|semana|semanas|mes|meses)\b/,
  /\bsemana\s+que\s+vem\b/,
]);

// Objetos VAGOS que não identificam um compromisso concreto -- quando só
// isso aparece, prefere-se PERGUNTAR ao usuário em vez de supor
// (ex.: "Bota aquele negócio pra sexta.").
export const PT_BR_SCHEDULE_VAGUE_SUBJECTS = Object.freeze([
  /\bnegocio\b/,
  /\baquel[ea]\s+(?:coisa|parada|negocio)\b/,
  /\bessa\s+coisa\b/,
]);

/**
 * Remove interjeições coloquiais do INÍCIO da frase já normalizada.
 * Nunca remove palavra real que comece com a mesma sequência: usamos
 * fronteira de palavra (ex.: "manhã" != "mano", "posso" != "po").
 */
export function stripColloquialLead(text) {
  if (typeof text !== 'string') return text;
  let out = text.trim();
  for (const interj of PT_BR_COLLOQUIAL_INTERJECTIONS) {
    const prefixRe = new RegExp(`^(?:${interj})\\b[\\s,!.?;:-]*`, 'i');
    let changed = true;
    while (changed && out) {
      const next = out.replace(prefixRe, '');
      changed = next !== out;
      out = next.trim();
    }
  }
  return out.replace(/^[\s,!.?;:-]+/, '').trim();
}

/**
 * Padrões de lembrete coloquiais. API estável: no futuro a camada
 * uni-language/pt-br/ substitui esta implementação.
 */
export function buildAgendaReminderPatterns() {
  return [...PT_BR_REMINDER_COLLOQUIALS];
}

/**
 * Padrões de criar-compromisso coloquiais. API estável (idem acima).
 */
export function buildAgendaSchedulePatterns() {
  return [...PT_BR_SCHEDULE_COLLOQUIALS];
}

/**
 * Verdadeiro quando o texto NORMALIZADO menciona apenas um objeto vago
 * ("aquele negocio", "aquilo") sem ter especificado qual evento/dentista --
 * nesse caso é melhor perguntar ao usuário do que supor
 * ("Claro. O que você quer que eu marque para sexta?").
 */
export function hasAgendaVagueSubject(text) {
  if (typeof text !== 'string') return false;
  return PT_BR_SCHEDULE_VAGUE_SUBJECTS.some((re) => re.test(text));
}
