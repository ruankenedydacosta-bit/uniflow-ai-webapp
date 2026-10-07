// Dados da Política de Privacidade que o código precisa conhecer: metadados
// da página (usados também pelo prerender) e a lista de provedores que
// recebem dado pessoal.
//
// A lista de provedores acompanha o código. Integração nova que envie dado
// do usuário a um terceiro entra aqui na mesma PR: o teste
// privacidadePrerender.test.js varre o código atrás de domínios externos e
// falha se algum não tiver provedor correspondente nesta lista.

import { SUPPORT_WHATSAPP_NUMBER } from '../simplified-app/simplifiedSupportConfig.js';

export const PRIVACIDADE_ROUTE = '/privacidade';

export const PRIVACIDADE_ATUALIZADA_EM = '7 de outubro de 2026';

export const CONTATO_PRIVACIDADE = Object.freeze({
  email: 'contato@uniflow.ai',
  whatsapp: formatarWhatsApp(SUPPORT_WHATSAPP_NUMBER),
  whatsappUrl: `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`,
});

// '5547920008797' -> '+55 47 92000-8797'
function formatarWhatsApp(numero) {
  const [, ddi, ddd, inicio, fim] = numero.match(/^(\d{2})(\d{2})(\d+)(\d{4})$/);
  return `+${ddi} ${ddd} ${inicio}-${fim}`;
}

export const PAGE_META = Object.freeze({
  title: 'Política de Privacidade | UniFlow AI',
  description:
    'Saiba quais dados a UniFlow AI coleta, para que usa, com quem compartilha e como exercer seus direitos pela LGPD.',
});

export const PROVEDORES = Object.freeze([
  {
    nome: 'Supabase',
    recebe: 'Todos os dados da sua conta, inclusive e-mail, senha protegida, registros financeiros, agenda e conversas com a Uni.',
    finalidade: 'Banco de dados, autenticação e armazenamento de arquivos.',
  },
  {
    nome: 'Vercel',
    recebe: 'Endereço IP e dados do navegador ao abrir o app.',
    finalidade: 'Hospedagem do aplicativo.',
  },
  {
    nome: 'OpenAI',
    recebe: 'O que você escreve ou fala para a Uni, o histórico recente da conversa, nomes de contas e categorias, um resumo dos seus números do mês, seu nome preferido ou primeiro nome e a pronúncia do nome na conversa por voz, e o áudio da sua voz.',
    finalidade: 'Entender seus pedidos, gerar as respostas da Uni, transcrever sua voz e gerar a voz da Uni.',
  },
  {
    nome: 'ElevenLabs',
    recebe: 'O texto das respostas da Uni.',
    finalidade: 'Provedor alternativo para gerar a voz da Uni. Só recebe dados quando estiver em uso.',
  },
  {
    nome: 'Asaas',
    recebe: 'Nome, CPF ou CNPJ, e-mail, celular e dados do pagamento.',
    finalidade: 'Cobrança da assinatura por Pix ou cartão.',
  },
  {
    nome: 'Google',
    recebe: 'Nome, e-mail e foto de perfil, se você entrar com o Google. Endereço IP ao carregar as fontes do app. Dados de navegação, se você permitir o Google Analytics.',
    finalidade: 'Login com Google, fontes do app e estatísticas de uso.',
  },
  {
    nome: 'Sentry',
    recebe: 'Códigos de erro e identificadores sem o seu nome, e-mail ou valores. A conexão revela o endereço IP.',
    finalidade: 'Encontrar e corrigir falhas do app.',
  },
  {
    nome: 'Serviços de notificação do navegador (Google, Apple e Mozilla)',
    recebe: 'Título e horário do lembrete, de forma criptografada.',
    finalidade: 'Entregar os lembretes da agenda, se você ativar as notificações.',
  },
  {
    nome: 'WhatsApp (Meta)',
    recebe: 'A mensagem que você enviar.',
    finalidade: 'Atendimento, só se você escolher falar com o suporte pelo WhatsApp.',
  },
]);
