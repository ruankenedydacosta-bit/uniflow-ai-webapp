// Número oficial de atendimento da UniFlow AI. É público por natureza -- é o
// próprio destino do link wa.me exposto no frontend -- por isso não faz
// sentido tratá-lo como segredo/variável de ambiente.
export const SUPPORT_WHATSAPP_NUMBER = '5547920008797';

const SUPPORT_WHATSAPP_MESSAGE = 'Olá! Estou entrando em contato pelo suporte da UniFlow AI.';

export function buildSupportWhatsAppUrl() {
  const params = new URLSearchParams({ text: SUPPORT_WHATSAPP_MESSAGE });
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?${params.toString()}`;
}
