# Issue #114 versus épico #54 — decisão comercial pendente

Em 26/10/2026 o usuário confirmou que a decisão comercial ainda está pendente e pediu preparar os dois cenários sem alterar o catálogo. A issue #114 está aberta, sem comentários, e não define regras de migração ou troca de cotas. Referência: https://github.com/ruankenedydacosta-bit/uniflow-ai-webapp/issues/114 .

## Cenários de homologação

| Tema | A: comportamento implementado | B: proposta da #114, ainda não implementada |
| --- | --- | --- |
| Produto vendido | Plano Pessoal, `pro`, R$ 29,90/mês | Essencial R$ 14,90/20 min; Uni Voz R$ 29,90/60 min; Uni Voz Plus R$ 69,90/180 min |
| Catálogo técnico | `free`, `pro`, `business`, `enterprise`; somente `pro` comercializado | Identificadores novos e relação com capacidades existentes precisam de aprovação |
| Limite de voz | Sem cota comercial mensal implementada | Cota obrigatória, imposta no banco |
| Assinantes existentes | Preservar `pro`, preço, dados e período pago | Não assumir que `pro` vira Uni Voz só porque o preço é igual |
| Troca de plano | Não há fluxo comercial de upgrade/downgrade | Definir quando troca preço/cota, prorrata e saldo do ciclo |
| Aceite | Homologar comportamento técnico atual sem aprovar lançamento | Assinar, trocar e cancelar cada plano no Sandbox, conferindo saldo após cada evento |

Os testes do cenário A verificam o comportamento existente. Não constituem aprovação comercial do plano único nem aceitação da #114. Não trocar nomes/preços/cotas silenciosamente para acomodar a proposta.

## Impactos técnicos de adotar o cenário B

1. **Catálogo e banco:** criar IDs comerciais aprovados; revisar `plans_id_check`, catálogo de capacidades e metadados de preço/ciclo/cota versionados no servidor. Preservar histórico de preço e não confundir plano Business/capacidade de PJ com o novo plano de voz mais caro.
2. **Edge Functions:** `billing-create-subscription`, `billing-create-checkout` e Pix Automático devem obter produto/preço no catálogo servidor e fixá-los na tentativa e assinatura. Hoje aceitam somente `BILLING_PLAN_ID` e o preço mensal do MVP. Cliente nunca escolhe valor livre.
3. **Verificação financeira:** webhook, sync, worker, cancelamento e recuperação GET devem validar o valor contratado do ciclo, não uma constante global de R$29,90. Isso inclui `billingSubscriptionRules.ts`, `billingLifecycle.ts`, `subscriptionRecovery.ts` e `pixAutomaticRules.ts`. Simplesmente aceitar três valores permite cruzar planos e não resolve o vínculo correto.
4. **Identidade e idempotência:** revisar locks por workspace/plano. IDs diferentes não podem permitir duas recorrências indevidas durante troca. Contrato/ciclo/versão do preço precisam acompanhar Checkout, externalReference, autorização Pix e histórico. Verificar regras Asaas para alterar preço e autorização antes de implementar mudança recorrente.
5. **Cotas de voz:** definir ledger de consumo/reserva no PostgreSQL com atualização atômica, idempotência e reversão de reserva quando a execução falhar. Conferir quota no servidor antes de processar voz; RLS isoladamente não contabiliza minutos. Escolher fonte de duração, arredondamento, ASR/TTS, cache, retransmissão e mensagens parcialmente processadas.
6. **Migração de pagantes:** mapear `pro` para o produto aprovado, ou manter legado com grandfathering. Preservar preço/dias pagos/benefícios e decidir o saldo do primeiro ciclo. Criar ensaio com cópia anonimizada e comparação antes/depois; não editar subscriptions existentes por equivalência de preço.
7. **Frontend e conhecimento do produto:** checkout, tela de plano/assinatura, histórico, mensagens da Uni e analytics devem mostrar produto e cota corretos. Não reaproveitar texto estático de Plano Pessoal para todos os três planos.
8. **RLS/RPCs:** atualizar grants/capacidades e proteger ledger de voz contra escrita do cliente. Revogar overloads antigos se abrirem caminho para saldo/consumo livre. Continuar permitindo regularização e histórico durante suspensão.

## Decisões necessárias antes de alterar o catálogo

- Qual cenário entra primeiro e quais IDs comerciais serão usados?
- Destino de cada assinante `pro`; preservação de preço/benefícios e tratamento de quem já pagou.
- Minutos medem entrada ASR, saída TTS ou ambas? Qual arredondamento? Cache, tentativas falhas e reprocessamento consomem?
- Cota reinicia por mês civil ou ciclo de cobrança? Há acumulação, saldo negativo ou bloqueio imediato? Como tratar atraso/carência?
- Upgrade/downgrade tem efeito imediato ou no próximo ciclo? Há prorrata, crédito ou cobrança complementar? Como tratar saldo já consumido e cancelamento?
- As alterações exigem novo consentimento de Pix Automático? Comprovar comportamento do provedor em Sandbox antes de ofertar troca.

## Matriz de testes preparada para o cenário B

Para **cada** plano aprovado: criar/confirmar assinatura, conferir preço e quota, repetir eventos sem duplicar crédito, consumir até o limite com chamadas concorrentes, rejeitar excedente no servidor, renovar e conferir reset, atrasar/regularizar sem duplicação, cancelar preservando período pago e impedir novas cotas fora do ciclo.

Testar as seis direções de troca entre os três planos com as regras comerciais aprovadas, troca durante carência/cancelamento agendado, eventos fora de ordem e reenvio do mesmo evento. Ensaiar cada grupo de `pro` legado. Sem as decisões acima, estes casos ficam **bloqueados**, nunca marcados como aprovados por usar mocks do catálogo antigo.
