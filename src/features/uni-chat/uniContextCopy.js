// Microcopy da Uni derivada do contexto ativo (PF/PJ), consumida tanto pela
// tela do chat (estado vazio) quanto pelo prompt de sistema enviado ao LLM
// (src/features/uni-llm/llmContext.js). Função pura, sem dependência de React
// nem de rede — mantém a fonte única de vocabulário por contexto e evita
// duplicar strings soltas em cada componente.
//
// Regra de isolamento: a saída depende SOMENTE do `workspaceType` recebido.
// Nada aqui lê estado global, cache ou histórico — por isso, ao trocar de
// workspace, o chamador (UniChatPage/llmContext) sempre obtém a copy do
// contexto novo, sem resíduo do contexto anterior.

const BUSINESS_WORKSPACE_TYPE = 'business';

export function normalizeWorkspaceType(workspaceType) {
  return workspaceType === BUSINESS_WORKSPACE_TYPE ? 'business' : 'personal';
}

export function getEmptyStateQuestion(workspaceType) {
  return normalizeWorkspaceType(workspaceType) === 'business'
    ? 'O que vamos organizar hoje na sua empresa?'
    : 'O que vamos organizar hoje no seu dinheiro?';
}

// Instruções de vocabulário/tom explícitas por contexto, para compor o
// prompt de sistema do LLM (uni-llm/llmContext.js). Reforça, com palavras
// concretas, o que a Uni já recebe em `workspaceType` — o modelo não deve
// inferir o tom sozinho.
export function getContextVocabularyGuidance(workspaceType) {
  if (normalizeWorkspaceType(workspaceType) === 'business') {
    return {
      subject: 'sua empresa',
      vocabularyHints: ['fluxo de caixa', 'faturamento', 'recebimentos', 'fornecedores', 'margem'],
      example: 'Exemplo de tom: "O fluxo de caixa da sua empresa está estável este mês."',
    };
  }
  return {
    subject: 'você',
    vocabularyHints: ['seu dinheiro', 'suas entradas', 'suas saídas', 'suas contas'],
    example: 'Exemplo de tom: "Suas entradas e saídas estão organizadas este mês."',
  };
}

export function buildContextGuidanceLines(workspaceType) {
  const guidance = getContextVocabularyGuidance(workspaceType);
  return [
    `- Fale sempre sobre ${guidance.subject}. Nunca misture vocabulário do outro contexto (PF/PJ) nesta resposta.`,
    `- Vocabulário preferido neste contexto: ${guidance.vocabularyHints.join(', ')}.`,
    `- ${guidance.example}`,
  ];
}
