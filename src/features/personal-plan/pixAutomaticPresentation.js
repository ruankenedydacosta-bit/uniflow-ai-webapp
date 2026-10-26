export function pixAutomaticMessage(authorization) {
  if (!authorization) return 'Nenhuma autorização de Pix Automático encontrada.';
  if (authorization.cancellation_requested && ['CREATING', 'CREATED', 'ACTIVE'].includes(authorization.status)) {
    return 'Pedido de cancelamento registrado. Estamos acompanhando a confirmação do banco.';
  }
  if (authorization.status === 'ACTIVE') return 'Pix Automático autorizado para as próximas cobranças.';
  if (authorization.status === 'CREATING') return 'Sua autorização está em verificação. Não gere outro pagamento enquanto a consulta estiver pendente.';
  if (authorization.status === 'CREATED') return authorization.initial_payment_confirmed
    ? 'Pagamento do período confirmado. Aguardando o banco autorizar as próximas cobranças automáticas.'
    : 'Pague o QR Code e confirme no seu banco a autorização para os próximos pagamentos.';
  return authorization.initial_payment_confirmed
    ? 'O pagamento deste período continua válido. As próximas cobranças automáticas não estão autorizadas.'
    : 'A autorização não foi concluída. Verifique o pagamento antes de iniciar uma nova tentativa.';
}
export function canShowPixAutomaticQr(authorization, now = Date.now()) {
  if (!authorization || authorization.status !== 'CREATED' || authorization.initial_payment_confirmed || authorization.cancellation_requested) return false;
  let expiration = authorization.expiration_date;
  if (typeof expiration !== 'string') return false;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(expiration)) expiration = `${expiration.replace(' ', 'T')}-03:00`;
  return Date.parse(expiration) > now && typeof authorization.payload === 'string' && authorization.payload.length > 0;
}
