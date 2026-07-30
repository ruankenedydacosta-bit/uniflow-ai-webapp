begin;

-- BLOCO ASAAS CHECKOUT: correlacao do webhook de pagamento quando a
-- assinatura foi originada por um Asaas Checkout hospedado (cartao de
-- credito). O Checkout so aceita `customerData` (nunca um `customer` id
-- existente) -- a Asaas pode criar um cliente novo, diferente do
-- `asaas_customer_id` ja salvo em billing_customers para o workspace.
-- Quando isso acontece, o webhook PAYMENT_CONFIRMED/PAYMENT_RECEIVED nao
-- encontra o workspace pelo `payment.customer` -- precisa de um caminho de
-- correlacao alternativo.
--
-- Fonte oficial (confirmado via docs.asaas.com nesta mesma auditoria):
-- GET /v3/subscriptions/{id} (retrieve-a-single-subscription) devolve o
-- campo `checkoutSession` -- o id do Checkout que originou a assinatura.
-- Guardando esse id localmente no momento da criacao do Checkout
-- (billing-create-checkout), o webhook consegue: consultar a assinatura na
-- Asaas, ler `checkoutSession`, e localizar esta linha por
-- `asaas_checkout_id` -- sem depender do `customer` id, que pode ter
-- mudado.
--
-- Estrategia aditiva (mesmo padrao da migration 024): coluna nullable, sem
-- alterar nenhuma linha existente.
alter table public.subscriptions
  add column asaas_checkout_id text;

comment on column public.subscriptions.asaas_checkout_id is
  'BLOCO ASAAS CHECKOUT: id do Asaas Checkout hospedado (cartao) que originou esta assinatura -- usado para correlacionar o webhook de pagamento quando o customerId do checkout difere do ja salvo em billing_customers. Nulo para assinaturas criadas fora do Checkout (ex.: Pix direto).';

-- Indice UNICO parcial (nao apenas indice comum): um Checkout Asaas deve
-- corresponder no maximo a UMA assinatura local -- impede associacao
-- acidental do mesmo checkout a duas assinaturas. `where ... is not null`
-- permite multiplas linhas com asaas_checkout_id nulo (todas as assinaturas
-- criadas fora do Checkout, maioria absoluta hoje).
create unique index subscriptions_asaas_checkout_id_uidx
  on public.subscriptions (asaas_checkout_id)
  where asaas_checkout_id is not null;

commit;
