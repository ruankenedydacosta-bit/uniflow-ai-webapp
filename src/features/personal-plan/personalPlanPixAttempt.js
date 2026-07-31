// BUGFIX (modal Pix quebrado): um registro de assinatura com
// internal_status === 'pending' NÃO é, por si só, uma tentativa Pix ativa
// -- pode ser um checkout de cartão abandonado (payment_method:
// 'credit_card', sem nenhum dado de Pix), ou um registro incompleto por
// qualquer outro motivo (falha ao buscar o QR na Asaas, corrida de rede
// etc.). Reabrir o modal "Pagamento Pix" automaticamente só é seguro
// quando TODOS os sinais abaixo existem ao mesmo tempo. Função central --
// nenhum componente decide isso sozinho, nenhuma validação divergente
// espalhada pelo código.

// Payload mínimo para o modal Pix funcionar de verdade -- QR Code (base64)
// + copia-e-cola, sempre vindos prontos da Asaas via billing-create-
// subscription/billing-get-subscription, nunca gerados no frontend.
export function isValidPixPayload(pix) {
  return Boolean(
    pix
    && typeof pix.payload === 'string' && pix.payload.trim()
    && typeof pix.encoded_image === 'string' && pix.encoded_image.trim(),
  );
}

// Resposta de billing-get-subscription (mount/reload): só method explicitamente
// 'pix' + status 'pending' + payload Pix real e completo autorizam restaurar
// o estado "aguardando pagamento" sozinho, sem nenhuma ação do usuário.
export function isValidPersistedPixAttempt(subscriptionData) {
  if (!subscriptionData || subscriptionData.exists === false) return false;
  if (subscriptionData.internal_status !== 'pending') return false;
  if (subscriptionData.payment_method !== 'pix') return false;
  return isValidPixPayload(subscriptionData.pix);
}
