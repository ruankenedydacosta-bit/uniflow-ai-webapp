// SUPORTE1: perguntas frequentes da Central de Suporte.
//
// Cada item aponta para um id do manifesto oficial (docs/product-knowledge/
// via productKnowledgeManifest.js) -- a resposta exibida é sempre o
// `content` já existente dessa entrada, nunca um texto novo escrito aqui.
// Isso evita que a FAQ divirja do conhecimento oficial (a mesma fonte usada
// pelo modo UNI_MODE.SUPPORT via retrieveProductKnowledge).
export const SUPPORT_FAQ_CATEGORIES = Object.freeze([
  {
    id: 'primeiros-passos',
    label: 'Primeiros passos',
    items: [
      { question: 'Como registrar uma movimentação?', knowledgeId: 'financial-management' },
      { question: 'Onde encontro meus objetivos?', knowledgeId: 'goals' },
      { question: 'Como funciona a UniFlow AI?', knowledgeId: 'product-overview' },
    ],
  },
  {
    id: 'conta-acesso',
    label: 'Conta e acesso',
    items: [
      { question: 'Como recupero minha senha?', knowledgeId: 'authentication-and-onboarding' },
      { question: 'Como faço login com Google?', knowledgeId: 'authentication-and-onboarding' },
    ],
  },
  {
    id: 'pessoal-empresa',
    label: 'Pessoal e Empresa',
    items: [
      { question: 'Como alternar entre Pessoal e Empresa?', knowledgeId: 'workspaces-pf-pj' },
      { question: 'A Uni consegue acessar minha outra empresa?', knowledgeId: 'workspaces-pf-pj' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    items: [
      { question: 'A Open Finance já conecta ao banco?', knowledgeId: 'financial-management' },
      { question: 'Como funciona o parcelamento?', knowledgeId: 'financial-management' },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    items: [
      { question: 'Como faço para agendar uma reunião?', knowledgeId: 'agenda-and-projects' },
      { question: 'Onde fica a Agenda?', knowledgeId: 'agenda-and-projects' },
    ],
  },
  {
    id: 'objetivos',
    label: 'Metas',
    items: [
      { question: 'Como acompanho o progresso de uma meta?', knowledgeId: 'goals' },
    ],
  },
  {
    id: 'chat-uni',
    label: 'Chat da Uni',
    items: [
      { question: 'Como excluo uma conversa?', knowledgeId: 'uni-chat' },
      { question: 'A Uni pode alterar minha conta por mim?', knowledgeId: 'uni-chat' },
    ],
  },
  {
    id: 'voz',
    label: 'Voz',
    items: [
      { question: 'Como ouço uma resposta da Uni?', knowledgeId: 'uni-voice' },
      { question: 'Como configurar a voz da Uni?', knowledgeId: 'uni-voice' },
      { question: 'A voz consome crédito toda vez que repito?', knowledgeId: 'uni-voice' },
      { question: 'Como desativo a voz?', knowledgeId: 'uni-voice' },
    ],
  },
  {
    id: 'notificacoes',
    label: 'Notificações',
    items: [
      { question: 'Onde encontro minhas notificações?', knowledgeId: 'notifications' },
    ],
  },
  {
    id: 'privacidade-seguranca',
    label: 'Privacidade e segurança',
    items: [
      { question: 'Meus dados financeiros são usados no modo suporte?', knowledgeId: 'uni-chat' },
    ],
  },
  {
    id: 'demonstracao',
    label: 'Funcionalidades em demonstração',
    items: [
      { question: 'O que ainda está em demonstração?', knowledgeId: 'troubleshooting' },
      { question: 'Existe uma função de contratos?', knowledgeId: 'agenda-and-projects' },
      { question: 'Existe cobrança ou assinatura real?', knowledgeId: 'plans-and-limitations' },
    ],
  },
]);

// Perguntas de exemplo mostradas em destaque, acima da FAQ (campo principal
// "Como a Uni pode ajudar?"). Reaproveitam o MESMO texto de perguntas já
// validadas na fase OPENAI4 -- nunca uma pergunta nova, não testada.
export const SUPPORT_SUGGESTED_QUESTIONS = Object.freeze([
  'Como registrar uma movimentação?',
  'Como alternar entre Pessoal e Empresa?',
  'Onde fica a Agenda?',
  'Como configurar a voz da Uni?',
  'A Open Finance já funciona de verdade?',
  'Como excluir uma conversa?',
]);
