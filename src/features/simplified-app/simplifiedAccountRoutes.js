// ETAPA 4: rotas internas da área de Conta -- centralizadas aqui para que
// routes.jsx e SimplifiedAccountPage.jsx nunca declarem os mesmos paths em
// dois lugares (fonte única, mesmo padrão de simplifiedRoutes.js).
// Cada rota já existe e navega de verdade nesta fase; o CONTEÚDO de cada
// uma (fora Editar perfil/Segurança, que ganham mensagem própria) é um
// placeholder honesto -- "ainda não implementado", nunca uma tela em
// branco nem dado fictício.
//
// BLOCO FINAL DO MVP (Sobre a UniFlow AI): "Privacidade e dados" foi
// removida TOTALMENTE (id + rota) do menu Conta -- será implementada no
// futuro junto de LGPD, exportação/exclusão de conta e permissões;
// construir um placeholder agora só criaria uma promessa vazia.
// "Notificações" voltou na Fase 3 do redesign (#90) como página própria
// (tela 13 do handoff); o sino do header segue abrindo o painel rápido.
export const ACCOUNT_SUBROUTE_IDS = Object.freeze({
  EDIT_PROFILE: 'edit-profile',
  SECURITY: 'security',
  PLAN: 'plan',
  PAYMENTS: 'payments',
  PAYMENT_HISTORY: 'payment-history',
  MY_ACCOUNTS: 'my-accounts',
  VOICE: 'voice',
  SUPPORT: 'support',
  THEME: 'theme',
  ABOUT: 'about',
  // Fase 3 do redesign (#90): a tela 13 do handoff é uma página própria de
  // notificações, alcançada pelo item "Notificações" do Mais. O sino do
  // header continua abrindo o painel rápido nas telas que o têm.
  NOTIFICATIONS: 'notifications',
  // Épico #98 (#99): conexão com o Google Agenda. Fora do Mais: a entrada
  // fica em Configurações → Preferências, atrás de VITE_AGENDA_GOOGLE_ENABLED
  // (#102).
  GOOGLE_CALENDAR: 'google-calendar',
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
  // BLOCO FINAL DO MVP (Histórico de pagamentos): tela real única que serve
  // tanto "Ver histórico de pagamentos" (Seu plano) quanto "Notas fiscais e
  // recibos" -- mesmos dados (billing_payments), cada item já traz seu
  // próprio comprovante (invoice_url) quando existe.
  [ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY]: Object.freeze({
    path: '/app/conta/pagamentos/historico',
    title: 'Histórico de pagamentos',
    description: 'Seus pagamentos e recibos, quando disponíveis.',
  }),
  [ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS]: Object.freeze({
    path: '/app/conta/minhas-contas',
    title: 'Minhas contas',
    description: 'Em breve você poderá gerenciar suas contas financeiras por aqui.',
  }),
  [ACCOUNT_SUBROUTE_IDS.VOICE]: Object.freeze({
    path: '/app/conta/voz',
    title: 'Voz da Uni',
    description: 'Escolha como a Uni deve desenvolver as respostas.',
  }),
  [ACCOUNT_SUBROUTE_IDS.SUPPORT]: Object.freeze({
    path: '/app/conta/suporte',
    title: 'Suporte',
    description: 'Em breve você poderá falar com nossa equipe diretamente por aqui.',
  }),
  [ACCOUNT_SUBROUTE_IDS.THEME]: Object.freeze({
    path: '/app/conta/tema',
    title: 'Tema',
    description: 'Escolha como a UniFlow aparece neste dispositivo.',
  }),
  // BLOCO FINAL DO MVP (Sobre a UniFlow AI): tela institucional real,
  // primeira versão oficial do MVP (v1.0.0) -- ver appIdentity.js.
  [ACCOUNT_SUBROUTE_IDS.ABOUT]: Object.freeze({
    path: '/app/conta/sobre',
    title: 'Sobre a UniFlow AI',
    description: 'Conheça a UniFlow AI: quem somos, nossa missão e o que a Uni faz por você.',
  }),
  [ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS]: Object.freeze({
    path: '/app/conta/notificacoes',
    title: 'Notificações',
    description: 'Veja os avisos da Uni sobre contas, lembretes e sua conta.',
  }),
  [ACCOUNT_SUBROUTE_IDS.GOOGLE_CALENDAR]: Object.freeze({
    path: '/app/conta/google-agenda',
    title: 'Google Agenda',
    description: 'Conecte sua conta Google à agenda do UniFlow.',
  }),
});
