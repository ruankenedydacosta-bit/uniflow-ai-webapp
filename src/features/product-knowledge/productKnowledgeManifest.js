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
const UPDATED_AT = '2026-10-12';

// id estável (nunca renomear um id existente -- criar um novo e marcar o
// antigo como deprecated se o conteúdo for substituído).
export const PRODUCT_KNOWLEDGE_MANIFEST = Object.freeze([
  {
    id: 'product-overview',
    title: 'Visão geral da UniFlow AI',
    category: KNOWLEDGE_CATEGORIES.OVERVIEW,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/product-overview.md',
    routes: ['/app/home'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['uniflow', 'o que é o app', 'produto', 'visão geral', 'sobre o aplicativo'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'UniFlow AI é um aplicativo financeiro web mobile-first para organizar finanças pessoais (Espaço Pessoal/PF) e de um negócio (Espaço Empresa/PJ), com apoio da assistente Uni. Não existe app nativo iOS/Android nesta fase. Na experiência simplificada atual, o usuário navega por Home, Registros e Conta; pela área Conta acessa Agenda, Pagamento e assinatura, Minhas contas, Voz da Uni, Suporte e Sobre a UniFlow AI. Um usuário pode ter os dois espaços e alternar entre eles sem misturar dados.',
  },
  {
    id: 'navigation-desktop',
    title: 'Navegação — Desktop',
    category: KNOWLEDGE_CATEGORIES.NAVIGATION,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/navigation-desktop.md',
    routes: ['/dashboard', '/financeiro', '/categorias', '/open-finance', '/metas', '/futuro', '/crm', '/clientes', '/projetos', '/agenda', '/relatorios', '/uni-ai', '/configuracoes'],
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
    routes: ['/app/home', '/app/registros', '/app/conta', '/app/agenda', '/app/conta/suporte', '/app/conta/voz'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['barra inferior', 'menu mais', 'navegar no celular', 'onde fica no mobile', 'bottom navigation'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Na experiência simplificada atual, a barra inferior tem Home, Registros e Conta. Home concentra a interação com a Uni. Registros reúne movimentações financeiras. Em Conta ficam o seletor Pessoal/Empresa e os acessos a Editar perfil, Segurança, Agenda, Seu plano, Pagamento e assinatura, Histórico de pagamentos, Minhas contas, Voz da Uni, Suporte e Sobre a UniFlow AI. Agenda também pode ser aberta pela Uni. Suporte possui conversa própria e não acessa ferramentas financeiras.',
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
    routes: ['/app/home'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['dashboard', 'início', 'home', 'tela inicial', 'resumo financeiro', 'próximos passos'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'A Home simplificada (rota /app/home) mostra a saudação, a interação principal com a Uni e a resposta compacta mais recente. Logo abaixo fica a Leitura do mês: até três frases sobre as saídas por categoria, escritas pela Uni com IA (Claude Haiku, da Anthropic) como uma analista de orçamento. A Uni recebe só os números do mês por categoria e o nome da categoria, nunca a descrição dos registros. A leitura fica guardada no aparelho até o fim do dia, e um registro novo faz a Uni escrever de novo; são até 10 por dia. Sem a Uni (sem conexão, limite do dia, demora), aparece uma leitura calculada pelo app. O orçamento de cada categoria é o teto mensal definido ou, sem teto, a média dos 3 meses anteriores. Para definir o teto: Financeiro, histórico, filtrar uma categoria de saída e tocar em Definir teto no cartão "Orçamento mensal"; Remover teto volta para a média. Tocar numa frase abre o Financeiro filtrado pela categoria. A Uni usa o espaço Pessoal/Empresa ativo e não deve cruzar dados entre espaços.',
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
      'Na experiência simplificada, movimentações são consultadas e registradas em Registros (/app/registros) ou conversando com a Uni. Registrar entrada, saída, transferência ou ajuste exige os campos obrigatórios e confirmação explícita antes de salvar. Contas podem ser consultadas em Conta → Minhas contas. Cada operação respeita o espaço Pessoal/Empresa ativo. Open Finance continua sendo DEMONSTRAÇÃO VISUAL, sem conexão bancária real.',
  },
  {
    id: 'goals',
    title: 'Metas',
    category: KNOWLEDGE_CATEGORIES.GOALS,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/goals.md',
    routes: ['/app/metas'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['meta', 'metas', 'objetivo', 'objetivos', 'reserva de emergência', 'aporte', 'contribuição', 'progresso da meta', 'criar meta pela uni', 'excluir meta', 'ajustar plano', 'meta atrasada'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Metas ficam em Mais → Produto → Metas (/app/metas). Cada meta tem valor-alvo, data, aportes e um status de ritmo (no ritmo, atenção ou atrasada). Meta em atenção ou atrasada mostra "Ajustar plano" no detalhe: guardar mais por mês, mudar a data, reduzir a meta ou pausar. Pela conversa e pela voz a Uni cria, altera, exclui e consulta metas, com card de confirmação antes de salvar. Meta com dinheiro guardado só é excluída na tela Metas. Aporte e retirada ainda são registrados na tela Metas.',
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
    routes: ['/app/agenda'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['agenda', 'agendar reunião', 'reunião', 'compromisso', 'tarefa', 'lembrete', 'projeto', 'prazo', 'contrato', 'documento', 'remarcar', 'desmarcar', 'cancelar compromisso', 'excluir compromisso'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'A Agenda está disponível nos espaços Pessoal e Empresa em Conta → Agenda e pela rota interna /app/agenda. A Uni também consulta, marca, remarca, cancela, conclui e exclui itens da Agenda pela conversa e pela voz, sempre no espaço ativo; antes de cancelar ou excluir ela pergunta se pode. Não existe integração com Google Calendar nesta fase. Projetos, contratos e documentos não estão expostos na interface simplificada atual.',
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
    routes: ['/app/home', '/app/uni', '/app/conta/voz'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['uni', 'chat', 'conversar com a uni', 'assistente', 'registrar por chat', 'apagar conversa', 'histórico de conversa', 'excluir movimentação', 'desfazer', 'criar categoria pela conversa', 'listar lançamentos', 'meta pela conversa'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Na conversa (/app/uni), a Uni responde perguntas financeiras com dados reais do espaço ativo e registra movimentações por linguagem natural: mostra um card de rascunho (ex.: "Saída · rascunho") com categoria, valor, conta, descrição e data, e nada é salvo antes de Confirmar. Pela conversa e pela voz a Uni também altera e exclui movimentações salvas (Desfazer por 20 segundos depois de excluir, uma por vez), lista movimentações e categorias, cria, renomeia e exclui categorias e cria, altera, exclui e consulta metas, sempre com card de confirmação. Compromissos da agenda são marcados, remarcados, cancelados, concluídos e excluídos com uma pergunta de confirmação. A Uni nunca executa uma ação sem confirmação nem finge ter feito algo que não fez. Abra a conversa em Mais > "Conversa com a Uni" ou por "Conversa" na tela de voz. No topo ficam "Ver histórico" e "Nova conversa"; embaixo, o campo "Escreva ou fale com a Uni". Perguntas de previsão futura não são respondidas por texto livre da IA. O histórico fica salvo e sincronizado com a conta; em "Ver histórico" dá para abrir ou apagar uma conversa. A Uni não acessa dados de outro espaço ou de outro usuário.',
  },
  {
    id: 'uni-voice',
    title: 'Voz da Uni',
    category: KNOWLEDGE_CATEGORIES.UNI,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/uni-voice.md',
    routes: ['/app/home', '/app/uni'],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['ouvir a uni', 'voz', 'áudio', 'reproduzir resposta', 'desativar voz', 'cache de voz', 'créditos de voz', 'conversa por voz', 'minutos de voz', 'interromper a uni', 'excluir pela voz', 'categoria pela voz', 'meta pela voz', 'agenda pela voz', 'desfazer'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'A voz da Uni pode ser usada na Home e na conversa completa. O aplicativo pede permissão de microfone antes da captura e reaproveita áudio já gerado. As preferências ficam em Conta → Voz da Uni. Áudio e transcrição não cruzam usuários nem espaços. Conversa por voz em tempo real: tocar no orb da Uni na barra inferior abre a conversa; a pessoa fala com pausas, pode interromper a Uni e toca em Parar para terminar. Pela voz dá para registrar, alterar e excluir movimentações (depois de excluir, dizer "desfazer" em até 20 segundos traz de volta), listar movimentações e categorias, criar, renomear e excluir categorias, criar, alterar, excluir e consultar metas e marcar, remarcar, cancelar, concluir e excluir compromissos. Movimentação, categoria e meta passam por um card: a Uni lê o que vai mudar e pergunta se pode confirmar; nada é salvo antes disso. Compromisso não tem card: a Uni pergunta se pode cancelar ou excluir. Se a pessoa fechar a tela de voz com um rascunho esperando, o card fica na Home. Cada plano tem minutos de conversa por voz por mês (Essencial 20, Uni Voz 60, Uni Voz Plus 180), vistos em Conta → Seu plano; quando acabam, o registro continua pelo texto, sem limite.',
  },
  {
    id: 'plans-and-limitations',
    title: 'Planos e limitações',
    category: KNOWLEDGE_CATEGORIES.PLANS,
    version: MANIFEST_VERSION,
    file: 'docs/product-knowledge/plans-and-limitations.md',
    routes: [],
    workspaces: WORKSPACE_SCOPE.BOTH,
    keywords: ['plano', 'essencial', 'uni voz', 'uni voz plus', 'business', 'enterprise', 'upgrade', 'trocar de plano', 'assinatura', 'pagamento', 'cobrança', 'minutos de voz', 'preço'],
    status: KNOWLEDGE_STATUS.AVAILABLE,
    updatedAt: UPDATED_AT,
    content:
      'Plano Pessoal em três opções, todas com acesso completo e registro por texto sem limite: Essencial R$ 14,90/mês com 20 minutos de conversa por voz, Uni Voz R$ 29,90/mês com 60 minutos, Uni Voz Plus R$ 69,90/mês com 180 minutos. Assinatura pela página do Plano Pessoal, com Pix ou cartão. Os minutos renovam a cada cobrança paga e não acumulam. Trocar de plano em Conta → Seu plano: para um plano mais barato, vale na próxima cobrança; para um mais caro, paga-se a diferença cheia por Pix e os minutos novos entram quando o pagamento é confirmado. Sem minutos, o registro continua pelo texto. Business e Enterprise (CRM, Clientes, Projetos, com Espaço Empresa) ainda não são contratados pela interface: indicar o suporte.',
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
