// ETAPA 4: rotas internas da área de Conta -- centralizadas aqui para que
// routes.jsx e SimplifiedAccountPage.jsx nunca declarem os mesmos paths em
// dois lugares (fonte única, mesmo padrão de simplifiedRoutes.js).
// Cada rota já existe e navega de verdade nesta fase; o CONTEÚDO de cada
// uma (fora Editar perfil/Segurança, que ganham mensagem própria) é um
// placeholder honesto -- "ainda não implementado", nunca uma tela em
// branco nem dado fictício.
export const ACCOUNT_SUBROUTE_IDS = Object.freeze({
  EDIT_PROFILE: 'edit-profile',
  SECURITY: 'security',
  PLAN: 'plan',
  PAYMENTS: 'payments',
  MY_ACCOUNTS: 'my-accounts',
  NOTIFICATIONS: 'notifications',
  VOICE: 'voice',
  PRIVACY: 'privacy',
  SUPPORT: 'support',
  ABOUT: 'about',
});

export const ACCOUNT_SUBROUTES = Object.freeze({
  [ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE]: Object.freeze({
    path: '/app/conta/editar-perfil',
    title: 'Editar perfil',
    description: 'Em breve você poderá atualizar nome, foto e dados por aqui.',
  }),
  [ACCOUNT_SUBROUTE_IDS.SECURITY]: Object.freeze({
    path: '/app/conta/seguranca',
    title: 'Segurança',
    description: 'Em breve você poderá gerenciar senha e acesso por aqui.',
  }),
  [ACCOUNT_SUBROUTE_IDS.PLAN]: Object.freeze({
    path: '/app/conta/plano',
    title: 'Seu plano',
    description: 'Em breve você verá aqui todos os detalhes do seu plano.',
  }),
  [ACCOUNT_SUBROUTE_IDS.PAYMENTS]: Object.freeze({
    path: '/app/conta/pagamentos',
    title: 'Pagamento e assinatura',
    description: 'A integração de pagamento ainda não está disponível nesta versão.',
  }),
  [ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS]: Object.freeze({
    path: '/app/conta/minhas-contas',
    title: 'Minhas contas',
    description: 'Em breve você poderá gerenciar suas contas financeiras por aqui.',
  }),
  [ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS]: Object.freeze({
    path: '/app/conta/notificacoes',
    title: 'Notificações',
    description: 'Em breve você poderá ajustar alertas e lembretes por aqui.',
  }),
  [ACCOUNT_SUBROUTE_IDS.VOICE]: Object.freeze({
    path: '/app/conta/voz',
    title: 'Voz da Uni',
    description: 'Escolha como a Uni deve desenvolver as respostas.',
  }),
  [ACCOUNT_SUBROUTE_IDS.PRIVACY]: Object.freeze({
    path: '/app/conta/privacidade',
    title: 'Privacidade e dados',
    description: 'Em breve você verá aqui como seus dados são usados.',
  }),
  [ACCOUNT_SUBROUTE_IDS.SUPPORT]: Object.freeze({
    path: '/app/conta/suporte',
    title: 'Suporte',
    description: 'Em breve você poderá falar com nossa equipe diretamente por aqui.',
  }),
  [ACCOUNT_SUBROUTE_IDS.ABOUT]: Object.freeze({
    path: '/app/conta/sobre',
    title: 'Sobre o UniFlow AI',
    description: 'Informações sobre o aplicativo.',
  }),
});
