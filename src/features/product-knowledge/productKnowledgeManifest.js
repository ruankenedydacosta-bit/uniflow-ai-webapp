// OPENAI3: fonte de verdade estruturada do conhecimento oficial de produto
// da UniFlow AI. Cada entrada espelha um documento em
// docs/product-knowledge/*.md, mas carrega um resumo curto e determinístico
// (não o markdown inteiro) para ser usado pela recuperação local
// (productKnowledgeRetrieval.js) e injetado no modo UNI_MODE.SUPPORT do
// chat -- nunca o manual completo de uma vez.
//
// Runtime-agnóstico de propósito: sem import.meta.env, sem window/document,
// sem APIs exclusivas de Node -- roda tanto no bundle Vite (frontend)
// quanto em qualquer ambiente ES module simples (ex.: node --test).

export const KNOWLEDGE_STATUS = Object.freeze({
  AVAILABLE: 'available',
  LIMITED: 'limited',
  DEMO: 'demo',
  FUTURE: 'future',
  DEPRECATED: 'deprecated',
});

export const WORKSPACE_SCOPE = Object.freeze({
  PERSONAL: 'personal',
  BUSINESS: 'business',
  BOTH: 'both',
});

export const KNOWLEDGE_CATEGORIES = Object.freeze({
  OVERVIEW: 'overview',
  NAVIGATION: 'navigation',
  AUTH: 'auth',
  WORKSPACES: 'workspaces',
  DASHBOARD: 'dashboard',
  FINANCIAL: 'financial',
  GOALS: 'goals',
  BUSINESS: 'business',
  NOTIFICATIONS: 'notifications',
  SETTINGS: 'settings',
  UNI: 'uni',
  PLANS: 'plans',
  SUPPORT: 'support',
  REFERENCE: 'reference',
});

const MANIFEST_VERSION = 1;
const UPDATED_AT = '2026-07-25';

// id estável (nunca renomear um id existente -- criar um novo e marcar o
// antigo como deprecated se o conteúdo for substituído).
export const PRODUCT_KNOWLEDGE_MANIFEST = Object.freeze([
  {
    id: 'product-overview',
    title: 'Visão geral da UniFlow AI',
    category: KNOWLEDGE_CATEGORIES.OVERVIEW,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/product-overview.md',
    routes: ['/dashboard'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['uniflow', 'o que é o app', 'produto', 'visão geral', 'sobre o aplicativo'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'UniFlow AI é um aplicativo financeiro web (mobile-first, também usável no desktop) para organizar finanças pessoais (Espaço Pessoal/PF) e, opcionalmente, de um negócio (Espaço Empresa/PJ), com apoio da assistente Uni. Não existe app nativo iOS/Android nesta fase. Após login, apresentação e Plano Pessoal, o usuário acessa o Dashboard e navega entre módulos pela barra lateral (desktop) ou barra inferior/menu Mais (mobile). Um usuário pode ter os dois espaços (Pessoal e Empresa) e alternar entre eles a qualquer momento.',
  },
  {
    id: 'navigation-desktop',
    title: 'Navegação — Desktop',
    category: KNOWLEDGE_CATEGORIES.NAVIGATION,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/navigation-desktop.md',
    routes: ['/dashboard', '/financeiro', '/categorias', '/open-finance', '/objetivos', '/futuro', '/crm', '/clientes', '/projetos', '/agenda', '/relatorios', '/uni-ai', '/configuracoes'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['barra lateral', 'sidebar', 'menu desktop', 'navegar no computador', 'onde fica no desktop'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'No desktop, a barra lateral fica sempre visível, agrupada em Visão geral (Dashboard, Visão de Futuro), Financeiro (Financeiro, Categorias, Open Finance, Objetivos, Agenda), Gestão (CRM, Clientes, Projetos — somente Espaço Empresa), Uni (chat) e Conta (Configurações). A barra superior tem o alternador Pessoal/Empresa, o sino de notificações e o menu da conta (Perfil, Configurações, Segurança, Sair). Relatórios só aparece a partir do plano Pro. Acesso direto por URL a um módulo bloqueado redireciona ao Dashboard com aviso.',
  },
  {
    id: 'navigation-mobile',
    title: 'Navegação — Mobile',
    category: KNOWLEDGE_CATEGORIES.NAVIGATION,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/navigation-mobile.md',
    routes: ['/dashboard', '/financeiro', '/uni-ai', '/agenda'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['barra inferior', 'menu mais', 'navegar no celular', 'onde fica no mobile', 'bottom navigation'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'No mobile, a barra inferior tem Home, Financeiro, Uni (botão central), Agenda e Mais. O menu Mais agrupa Conta (Perfil, Configurações, Segurança), Gestão (Clientes, CRM, Projetos — somente Espaço Empresa), Produto (Objetivos, Visão de Futuro, Categorias, Open Finance, Relatórios, Notificações) e Sessão (Sair). O item Suporte aparece no menu Mais mas está desabilitado ("em breve") — ainda não existe uma Central de Suporte navegável.',
  },
  {
    id: 'authentication-and-onboarding',
    title: 'Autenticação e onboarding',
    category: KNOWLEDGE_CATEGORIES.AUTH,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/authentication-and-onboarding.md',
    routes: ['/welcome', '/login', '/redefinir-senha', '/auth/callback', '/apresentacao', '/plano-pessoal'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['login', 'entrar', 'criar conta', 'cadastro', 'senha', 'esqueci minha senha', 'recuperar senha', 'google', 'apresentação', 'plano pessoal', 'primeiro acesso'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Sem sessão, / e a URL legada /welcome redirecionam para /login. Login por e-mail/senha ou "Entrar com Google" (não há login com Apple funcional, nem link mágico — Apple mostra "estará disponível em breve"). Recuperar senha: tocar "Esqueci minha senha" no login, informar o e-mail (resposta sempre neutra por segurança), abrir o link recebido, definir nova senha (mínimo 8 caracteres) em /redefinir-senha; o usuário é desconectado e precisa entrar de novo com a senha nova. Após autenticar, o gate vigente preserva /apresentacao e /plano-pessoal, quando aplicável, antes de /app/home. Sem 2FA e sem gerenciamento de sessões ativas.',
  },
  {
    id: 'workspaces-pf-pj',
    title: 'Workspaces — Pessoal (PF) e Empresa (PJ)',
    category: KNOWLEDGE_CATEGORIES.WORKSPACES,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/workspaces-pf-pj.md',
    routes: [],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['pessoal', 'empresa', 'pf', 'pj', 'trocar de espaço', 'alternar workspace', 'perfil de acesso', 'papel', 'owner', 'admin', 'member', 'viewer'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Um "espaço" (workspace) é o contexto de dados: Pessoal ou Empresa. Alterna-se pelo botão Pessoal/Empresa na barra superior (desktop) ou cabeçalho (mobile), instantaneamente, sem recarregar a página. Espaço Empresa libera CRM, Clientes e Projetos além de tudo do Pessoal. Papéis dentro de um espaço: owner (acesso completo), admin (edita/exclui a maioria), member (edita, não exclui a maioria), viewer (somente leitura). Não há tela dedicada de convite de membros confirmada como disponível nesta fase.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    category: KNOWLEDGE_CATEGORIES.DASHBOARD,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/dashboard.md',
    routes: ['/dashboard'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['dashboard', 'início', 'home', 'tela inicial', 'resumo financeiro', 'próximos passos'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'O Dashboard (rota /dashboard, tela "Home" no mobile) mostra um resumo de clareza financeira, próxima ação recomendada, até 3 sinais de atenção, métricas financeiras, checklist de ativação para novos usuários, gráfico de receitas x despesas e uma prévia da Visão de Futuro. Tudo calculado por regras determinísticas sobre dados reais do espaço ativo, nunca texto livre gerado sem checagem. Sem dados suficientes, mostra "ainda não há histórico suficiente para uma leitura financeira do período".',
  },
  {
    id: 'financial-management',
    title: 'Gestão financeira (Financeiro, Categorias, Open Finance, Relatórios)',
    category: KNOWLEDGE_CATEGORIES.FINANCIAL,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/financial-management.md',
    routes: ['/financeiro', '/categorias', '/open-finance', '/relatorios'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['registrar movimentação', 'despesa', 'receita', 'transferência', 'parcelamento', 'recorrência', 'categorias', 'open finance', 'conectar banco', 'relatórios', 'exportar', 'csv'],
    status: KNOWLEDGE_STATUS.LIMITED,
    updatedAt: UPDATED_AT,
    content:
      'Registrar movimentação (receita/despesa/transferência/ajuste) exige conta, descrição, valor > 0 e data. Parcelamento (1–360x) cria uma movimentação real por parcela. Recorrência hoje é só um rótulo — não gera lançamentos futuros automaticamente. Filtros por texto/período/tipo/conta/categoria; exportação apenas em CSV. Categorias têm tipo (receita/despesa/transferência) e escopo (pessoal/empresa/ambos). Open Finance (/open-finance) é uma DEMONSTRAÇÃO VISUAL, sem conexão bancária real — nunca afirmar que existe integração bancária real. Relatórios mostram séries mensais, médias, comparações e sinais de atenção calculados a partir de dados reais.',
  },
  {
    id: 'goals',
    title: 'Objetivos (metas financeiras)',
    category: KNOWLEDGE_CATEGORIES.GOALS,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/goals.md',
    routes: ['/objetivos'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['meta', 'metas', 'objetivo', 'objetivos', 'reserva de emergência', 'aporte', 'contribuição', 'progresso da meta'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Em /objetivos, o usuário cria metas com valor-alvo, valor inicial, aporte mensal planejado e datas, e registra aportes ao longo do tempo. O progresso mostra percentual concluído, valor restante, aporte mensal necessário e um status de ritmo (no ritmo, atenção ou atrasada), comparando o progresso real com o esperado para a data atual.',
  },
  {
    id: 'crm-and-clients',
    title: 'CRM e Clientes',
    category: KNOWLEDGE_CATEGORIES.BUSINESS,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/crm-and-clients.md',
    routes: ['/crm', '/clientes'],
    workspaces: WORKSPACE_SCOPE.BUSINESS,
    keywords: ['crm', 'clientes', 'oportunidade', 'pipeline', 'funil de vendas', 'cadastrar cliente', 'excluir cliente'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'CRM e Clientes existem apenas no Espaço Empresa. Cliente tem nome, tipo, estágio de relacionamento, contato e valor estimado; excluir um cliente só é permitido depois de arquivá-lo e falha se houver oportunidades de CRM vinculadas (nunca desvincula silenciosamente). Oportunidade pertence a um cliente e a uma etapa do funil; pode ser movida entre etapas e encerrada como ganha/perdida/cancelada — encerrar é definitivo, sem reabertura. O painel de CRM mostra métricas de conversão, ticket médio e valores em aberto/ganho/perdido.',
  },
  {
    id: 'agenda-and-projects',
    title: 'Agenda e Projetos',
    category: KNOWLEDGE_CATEGORIES.BUSINESS,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/agenda-and-projects.md',
    routes: ['/agenda', '/projetos'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['agenda', 'compromisso', 'tarefa', 'lembrete', 'projeto', 'prazo', 'contrato', 'documento'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Agenda (/agenda) está disponível nos dois espaços — reuniões, compromissos, tarefas, contas a pagar/receber e lembretes, com status de agendado para concluído/cancelado (sem reabertura). Projetos (/projetos) é exclusivo do Espaço Empresa — nome, status, prioridade, progresso, datas e cliente vinculado opcional; excluir é definitivo e exige owner/admin. Não existe uma funcionalidade dedicada de contratos e documentos no aplicativo atual.',
  },
  {
    id: 'notifications',
    title: 'Notificações',
    category: KNOWLEDGE_CATEGORIES.NOTIFICATIONS,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/notifications.md',
    routes: [],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['notificação', 'notificações', 'sino', 'avisos', 'marcar como lida', 'excluir notificação', 'push', 'e-mail'],
    status: KNOWLEDGE_STATUS.LIMITED,
    updatedAt: UPDATED_AT,
    content:
      'Notificações são somente dentro do aplicativo — não há envio por e-mail nem push. Acessadas pelo sino (barra superior no desktop, cabeçalho/menu Mais no mobile); é possível marcar como lida ou marcar todas, mas NÃO é possível excluir uma notificação. Hoje nenhum evento (financeiro, metas, agenda, CRM) dispara notificações automaticamente ainda.',
  },
  {
    id: 'settings-and-security',
    title: 'Configurações e segurança',
    category: KNOWLEDGE_CATEGORIES.SETTINGS,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/settings-and-security.md',
    routes: ['/configuracoes'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['configurações', 'perfil', 'editar nome', 'trocar e-mail', 'tema', 'segurança', 'duas etapas', '2fa', 'sessões ativas'],
    status: KNOWLEDGE_STATUS.LIMITED,
    updatedAt: UPDATED_AT,
    content:
      'Em /configuracoes: Perfil permite editar nome e telefone (e-mail e avatar não podem ser alterados pelo usuário). Preferências tem o seletor de tema e o interruptor de voz da Uni. Segurança só oferece troca de senha por e-mail — sem autenticação em duas etapas e sem gerenciamento de sessões ativas. Várias seções estão marcadas "Em breve": Perguntar à Uni, Preferências da Uni, Voz e interação (avançado), Notificações (preferências) e Leitura da Uni personalizada.',
  },
  {
    id: 'uni-chat',
    title: 'Chat da Uni',
    category: KNOWLEDGE_CATEGORIES.UNI,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/uni-chat.md',
    routes: ['/uni-ai'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['uni', 'chat', 'conversar com a uni', 'assistente', 'registrar por chat', 'apagar conversa', 'histórico de conversa'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Em /uni-ai, a Uni responde perguntas financeiras com base em dados reais do espaço ativo e ajuda a registrar movimentações por linguagem natural — sempre pedindo confirmação explícita antes de salvar qualquer coisa; a Uni nunca executa uma ação sem confirmação nem finge ter feito algo que não fez. Perguntas de previsão/tendência futura não são respondidas por texto livre da IA, para evitar números inventados. O histórico de conversa é salvo e sincronizado com a conta; é possível apagar uma conversa inteira. A Uni não acessa dados de outro espaço ou de outro usuário.',
  },
  {
    id: 'uni-voice',
    title: 'Voz da Uni',
    category: KNOWLEDGE_CATEGORIES.UNI,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/uni-voice.md',
    routes: ['/uni-ai'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['ouvir a uni', 'voz', 'áudio', 'reproduzir resposta', 'desativar voz', 'cache de voz', 'créditos de voz'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Tocar em "Ouvir" abaixo de uma resposta da Uni gera (ou reaproveita) e toca o áudio — nunca toca automaticamente sem esse toque do usuário. Dá para pausar, retomar e parar; abrir outra resposta interrompe a anterior. Ouvir a MESMA resposta de novo (mesmo texto, mesma conta), mesmo após atualizar a página ou sair e entrar de novo, reaproveita o áudio já gerado e NÃO consome créditos adicionais — o cache é privado por usuário, nunca compartilhado. Para desativar, usar o interruptor "Permitir voz nas respostas da Uni" em Configurações → Preferências. O cache expira em 30 dias.',
  },
  {
    id: 'plans-and-limitations',
    title: 'Planos e limitações',
    category: KNOWLEDGE_CATEGORIES.PLANS,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/plans-and-limitations.md',
    routes: [],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['plano', 'free', 'pro', 'business', 'enterprise', 'upgrade', 'assinatura', 'pagamento', 'cobrança'],
    status: KNOWLEDGE_STATUS.LIMITED,
    updatedAt: UPDATED_AT,
    content:
      'Planos: Free, Pro, Business e Enterprise. Relatórios exige Pro ou superior; CRM/Clientes/Projetos exigem Espaço Empresa E plano Business/Enterprise. O restante do produto está disponível em todos os planos. NÃO existe fluxo de upgrade ou cobrança real no aplicativo nesta fase — não há tela de pagamento/checkout funcional. Se perguntarem como fazer upgrade, responder que essa opção ainda não está disponível na interface e indicar suporte humano.',
  },
  {
    id: 'troubleshooting',
    title: 'Solução de problemas comuns',
    category: KNOWLEDGE_CATEGORIES.SUPPORT,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/troubleshooting.md',
    routes: [],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['problema', 'não funciona', 'erro', 'não consigo', 'ajuda', 'suporte'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Problemas comuns: e-mail de recuperação não chegou (checar spam, reenviar é seguro); CRM/Clientes/Projetos sumiram (só existem no Espaço Empresa); Relatórios sumiu (exige plano Pro+); movimentação recorrente não se repetiu (esperado, é só um rótulo); Open Finance não conecta banco de verdade (é demonstração); Uni "esqueceu" algo (sem memória ilimitada entre conversas nesta fase); notificação não some ao excluir (não é possível excluir, só marcar como lida); upgrade de plano (ainda não disponível pela interface). Fora desses casos mapeados, admitir que não há resposta confirmada e indicar suporte humano.',
  },
  {
    id: 'glossary',
    title: 'Glossário',
    category: KNOWLEDGE_CATEGORIES.REFERENCE,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/glossary.md',
    routes: [],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['glossário', 'termos', 'significado', 'o que é pf', 'o que é pj', 'o que é workspace'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Espaço (workspace): contexto de dados, Pessoal ou Empresa. PF: Pessoa Física (Espaço Pessoal). PJ: Pessoa Jurídica (Espaço Empresa). Uni: a assistente de IA do aplicativo. Papel (role): owner, admin, member ou viewer, define permissões dentro de um espaço. Open Finance nesta fase: demonstração visual, sem integração real. Cache de voz: reaproveitamento de áudio já gerado, sem gastar créditos de novo.',
  },
]);

export function getKnowledgeEntryById(id) {
  return PRODUCT_KNOWLEDGE_MANIFEST.find((entry) => entry.id === id) ?? null;
}

export function listAvailableStatuses() {
  return Object.values(KNOWLEDGE_STATUS);
}
