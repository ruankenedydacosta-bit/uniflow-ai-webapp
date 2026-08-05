// Uni Engine — Fase 22/23: Resposta Inteligente Integrada + Síntese Consultiva.
//
// Combina o texto do LLM (contexto conversacional, tom/personalidade já
// aplicados pelo prompt existente) com a narrativa do Tool Calling
// (buildToolResultNarrativeText, Fase 21) numa única resposta final,
// coerente, sem redundância e organizada por prioridade — respeitando o
// conversationStyle. Esta função é o único lugar que decide como os dois se
// combinam — nunca chama o LLM de novo, nunca executa Tool Calling de novo,
// nunca publica mais de uma resposta (quem publica continua sendo
// createAssistantResponse, uma única vez).
//
// FASE 23 — Síntese Consultiva: a narrativa do Tool Calling já nasce
// conclusão-primeiro (buildToolResultNarrativeText, Fase 21 — cada
// ferramenta começa pelo número/fato principal e só depois traz detalhe).
// Esta função usa essa primeira frase como a CONCLUSÃO da resposta e
// organiza o restante por prioridade: 1. conclusão; 2. explicação (o texto
// do LLM, só quando acrescenta algo que a narrativa ainda não disse);
// 3. detalhes (as demais frases da narrativa). Não existe camada de
// "recomendação" nesta fase — nenhuma capacidade nova foi criada — então
// esse nível da prioridade simplesmente fica vazio.
//
// Garantias:
//   - sem toolResponseText: retorna llmText inalterado (comportamento
//     legado exatamente preservado — nem essa função entra em cena);
//   - sem llmText: retorna toolResponseText inalterado;
//   - quando um já contém o outro (mesma informação, ex.: o LLM já
//     respondeu com o mesmo texto que a narrativa produziria): retorna
//     apenas o mais completo dos dois, nunca repete;
//   - redundância é eliminada por FRASE, não só por string inteira — uma
//     frase do LLM que já está coberta por qualquer frase da narrativa é
//     descartada, mesmo que o resto do texto seja diferente;
//   - 'simple': extremamente objetivo — só a conclusão (mesmo precedente já
//     usado em condenseForSimpleStyle, financialQueryInterpreter.js, que
//     descarta parágrafos secundários nesse estilo);
//   - 'normal': equilíbrio entre naturalidade e informação — conclusão +
//     explicação + detalhes, compostos como um parágrafo corrido;
//   - 'detailed': resposta completa sem repetir informações — mesmas
//     partes, mas com separação clara entre elas.
function normalize(text) {
  return typeof text === 'string' ? text.trim() : '';
}

function stripTrailingPunctuation(text) {
  return text.replace(/[.!?\s]+$/g, '');
}

function containsNormalized(haystack, needle) {
  if (!needle) return false;
  const cleanNeedle = stripTrailingPunctuation(needle.toLowerCase());
  if (!cleanNeedle) return false;
  return haystack.toLowerCase().includes(cleanNeedle);
}

function splitSentences(text) {
  if (!text) return [];
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

// Remove de `sentences` qualquer frase já coberta por alguma frase de
// `reference` (contida nela ou que a contém, ignorando pontuação final) —
// a eliminação de redundância "por frase" pedida na Fase 23.
function dedupeAgainstSentences(sentences, reference) {
  return sentences.filter((sentence) => {
    const clean = stripTrailingPunctuation(sentence.toLowerCase());
    if (!clean) return false;
    return !reference.some((ref) => {
      const cleanRef = stripTrailingPunctuation(ref.toLowerCase());
      return cleanRef.includes(clean) || clean.includes(cleanRef);
    });
  });
}

export function composeFinalResponseText({ llmText, toolResponseText, conversationStyle = 'simple' } = {}) {
  const cleanLlmText = normalize(llmText);
  const cleanToolText = normalize(toolResponseText);

  if (!cleanToolText) return cleanLlmText || null;
  if (!cleanLlmText) return cleanToolText;

  // Evita redundância: se um dos textos já contém o outro por completo,
  // não repete — fica só com o mais completo.
  if (containsNormalized(cleanLlmText, cleanToolText)) return cleanLlmText;
  if (containsNormalized(cleanToolText, cleanLlmText)) return cleanToolText;

  const toolSentences = splitSentences(cleanToolText);
  const [conclusion, ...details] = toolSentences;
  const safeConclusion = conclusion ?? cleanToolText;

  // 'simple': extremamente objetivo — só a conclusão factual, sem o texto
  // conversacional do LLM (mesmo comportamento adotado por
  // condenseForSimpleStyle para esse eixo de estilo em outra parte da Uni).
  if (conversationStyle === 'simple') {
    return safeConclusion;
  }

  // 'normal'/'detailed': explicação (LLM) só entra quando ainda acrescenta
  // algo que a narrativa não cobre — nunca repete frase por frase.
  const llmSentences = splitSentences(cleanLlmText);
  const explanation = dedupeAgainstSentences(llmSentences, toolSentences).join(' ');
  const detailText = details.join(' ');

  const parts = [safeConclusion, explanation, detailText].filter(Boolean);
  if (parts.length === 1) return parts[0];

  return conversationStyle === 'detailed' ? parts.join('\n\n') : parts.join(' ');
}
