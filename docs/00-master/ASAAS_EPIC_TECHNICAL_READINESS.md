# Épico #54 — entrega técnica e homologação

Atualizado em 26/10/2026. Implementação preparada para revisão conjunta; aceite externo ainda pendente. Nenhuma issue foi fechada. Nenhuma migration remota, configuração financeira, credencial, produção ou cobrança real foi alterada. Este relatório não autoriza promoção.

## PRs e ordem de integração

Repositório: https://github.com/ruankenedydacosta-bit/uniflow-ai-webapp

| PR | Escopo | Base obrigatória |
| --- | --- | --- |
| #123 | #55: catálogo de capacidades no cliente | master |
| #124 | #55: autoridade SQL/RLS e Edge Functions | #123 |
| #125 | #56: criação e QR Pix, reserva durável | #124 |
| #126 | #57: webhook, retry durável, sync | #125 |
| #127 | #58: ativação e preservação de acesso pago | #126 |
| #128 | #61: histórico real e datas civis | #126 |
| #129 | #59: cancelamento no fim do período pago | #127 |
| #130 | #60: carência, avisos, suspensão e reativação | #129 |
| #131 | Pix Automático: consentimento e pagamento separados | #130 |
| Revisão final | Integra #128 + #131 e corrige achados de segurança | #131; contém merge de #128 |

Não integrar o último PR isoladamente nem tratá-lo como substituto dos anteriores. Depois de cada merge autorizado, atualizar as bases dos descendentes e confirmar o diff restante; o merge commit de #128 é intencional. Preferir revisão na ordem acima. O agente não executou merges na master.

## Resultado por issue e critérios de aceite

| Issue | Implementado e testado localmente | Evidência ainda necessária |
| --- | --- | --- |
| #55 | Chave canônica `pro`/Plano Pessoal, capacidades SQL, gates de Business, seleção da assinatura mais recente antes de conferir status; regressões de planos e RLS | Migração com cópia de dados reais de pagantes e stack Supabase/PostgREST completo; auditoria prévia de aliases legados antes de qualquer migração remota |
| #56 | CPF/erros, cliente existente, Pix, QR/copia-e-cola, lock contra duplicação, recuperação GET única após resposta perdida | QR real Sandbox; geração em produção depende de autorização futura e não foi executada |
| #57 | Token, persistência antes do efeito, claim atômico, consulta canônica, retry limitado, sync; vínculos de cliente/workspace/plano/valor conferidos | Entrega/reentrega real de webhook, token incorreto, fila pausada, retry e sync no Sandbox |
| #58 | Polling limitado, reconciliação no reload de tentativa pendente, período pago preservado e guards concorrentes | Medir pagamento→ativação em menos de 1 minuto no Sandbox e confirmar em duas sessões |
| #59 | INACTIVE impede novas faturas; mantém existentes, período pago e data de término; não usa DELETE na tentativa pendente | Conferir no painel Sandbox que não nasce nova fatura, acesso termina na data e cobranças existentes permanecem |
| #60 | Carência existente de 3 dias documentada e aplicada por vencimento civil brasileiro; avisos in-app deduplicados, suspensão com dados preservados, reativação | Homologar regra com responsável comercial; configurar agendamento Sandbox e comprovar reativação via pagamento externo |
| #61 | Histórico do espelho persistido/RLS, vazio, valor pt-BR e datas civis; comprovante limitado a HTTPS do domínio Asaas | Comparar linha a linha com painel Sandbox, incluindo pendente, vencido, recebido e cancelado |

O épico exige dinheiro real para o aceite final. A proibição atual de cobrança real mantém esse critério explicitamente pendente; não inserir `Closes` nos PRs antes do aceite.

## Inventário específico da #55

- **Cliente:** `supabase/functions/_shared/planCatalog.js`, `src/app/access.js`, `src/services/billingTypes.js`, `src/services/workspaceService.js` e SessionContext usam catálogo/capacidades; `personal` e `pessoal` restantes descrevem tipo de workspace/modo da Uni, não autorização de plano. O catálogo de grants de demo não autoriza sessões reais.
- **Backend/Edge:** `billing-*` usam `BILLING_PLAN_ID` para o produto vendido; preço/ciclo são definidos no backend. Vínculo e confirmação financeira precedem liberação. `uni-mode` e `openai-4` consultam capacidade pelo servidor. `billing-sync`, worker e cancelamento conferem customer + subscription + valor. Não há endpoint dedicado de relatório: os relatórios locais derivam dados financeiros protegidos por membership/RLS; não declarar uma proteção de endpoint inexistente.
- **RLS:** migration 048 acrescenta políticas restritivas às tabelas de Business; 052/054 acrescentam gate de suspensão/corte temporal ao produto. Membership/permissões de escrita anteriores continuam necessários. Homologar todas as combinações owner/member/inativo/outro workspace com JWTs reais em PostgREST.
- **SQL/banco:** `plan_capabilities` é a fonte de permissões; a assinatura mais recente é escolhida antes de validar elegibilidade. 053 protege RPCs financeiros e revoga overloads antigos. 054 restringe RPCs de autorização/pagamento ao service role. 056 persiste o cancelamento observado no provedor sem cortar o período pago; 055 impede reatribuição de dono/payment/subscription no espelho, permitindo somente NULL→subscription conhecido. Backfill legado, grants efetivos e aplicação de toda a cadeia de migrations continuam pendentes de ambiente isolado completo.
- **Regressão:** suíte de acesso, permissões e assinatura, SQL local e comparação diferencial de 1.470 combinações foram executados nas entregas #123/#124. O fixture PostgreSQL não equivale a executar todos os schemas/extensões/policies em Supabase.

## Revisão final de segurança

O diff foi revisado localmente; não é uma revisão humana independente. Achados corrigidos nesta entrega:

1. Webhook não conferia todos os vínculos de workspace, customer, plano e valor antes de conceder acesso. Pagamento divergente agora mantém evidência financeira, mas não libera assinatura.
2. Checkout só tentava correlacionar cliente desconhecido. A assinatura desconhecida passa pelo vínculo canônico também com cliente conhecido; falha de consulta deixa evento elegível a retry em vez de concluir silenciosamente.
3. Tentativa concluída sem persistência podia reutilizar resource ID sem reconsulta; tentativa incerta ficava sem recuperação automática segura. Reconsulta/listagem GET confirma uma única assinatura por cliente, referência do workspace, preço, ciclo e método. Zero/múltiplas correspondências ficam em reconciliação; não há novo POST.
4. Sync/worker/cancelamento não conferiam customer em todos os pagamentos consultados. A conferência agora antecede efeitos de acesso/cancelamento.
5. Espelho permitia reatribuição acidental de identidade num upsert. Trigger preserva o workspace e identificadores já vinculados.
6. Comprovante/redirect usavam URL externa diretamente. A UI só aceita HTTPS Asaas, sem credenciais embutidas, host parecido ou porta alternativa.
7. Reload de Pix pendente podia deixar pagamento já confirmado sem atualização. Faz uma reconciliação pontual; plano ativo não dispara essa consulta. QR expirado não é restaurado e o modal deixa de permitir cópia/pagamento ao expirar.

8. A reconciliação ignorava INACTIVE/EXPIRED do provedor. Agora confere identidade da assinatura e conserva o período pago com corte explícito, mesmo sem novas faturas de renovação. Sem data confiável, exige reconciliação e não inventa prazo.

## Validação reproduzível

- `npm test`: Analytics 90 testes; suíte principal 6.529 testes. Todos passaram na execução final desta entrega.
- `node --test src/services/billingFinalReview.test.js`: 34/34 passaram, executando processador de webhook, endpoint de criação, cliente HTTP e funções reais com transporte simulado. Inclui pagamento divergente, correlação Checkout, falha de provedor, recuperação sem POST, URL, reload e validade do QR.
- `BILLING_TEST_INCLUDE_PIX_AUTOMATIC=1 bash scripts/supabase/test-billing-lifecycle-local.sh`: passou em PostgreSQL 17 descartável. Inclui RLS, grants/RPCs, avisos, cutoff, consentimento separado de pagamento, identidade financeira e corridas reais: um único worker aceito; uma única reserva Pix comum x automático aceita. O harness não aceita DATABASE_URL e desliga seu cluster no fim.
- `deno check` para webhook, criação, sync, cancelamento, lifecycle e Pix Automático: passou. ESLint dos arquivos JS/JSX alterados, build e `git diff --check`: passaram.
- `npm run lint`: **falhou**, 168 erros e 2 avisos preexistentes fora do recorte (docs/Uni Engine); não declarar lint global verde. TypeScript das Edge Functions é validado por Deno, não pelo ESLint configurado neste projeto.
- Build mantém aviso de chunks maiores que 500 kB. Graphify atualizado; grafo com mais de 5 mil nós não gera HTML por limite da ferramenta.
- Primeiras execuções encontraram assertions textuais antigas após endurecer URL/Checkout. Foram atualizadas para o comportamento seguro; regressões executáveis foram adicionadas e a suíte final passou.
- `node scripts/supabase/check-billing-sandbox.mjs`: **SKIPPED**, faltam `ASAAS_API_KEY` e `ASAAS_BASE_URL` no ambiente. Código 2 significa configuração ausente, não sucesso. Nenhuma requisição ao provedor foi feita. Quando configurado, usa só GET de listagem no host Sandbox exato, sem imprimir credenciais ou dados. Recusa produção.

## Templates e configuração operacional

- `supabase/confirmation-email.html`: texto pt-BR com `{{ .ConfirmationURL }}`, sem tracking, imagens externas ou JavaScript. Arquivo preparado; não aplicado ao projeto hospedado, não altera confirmação obrigatória, SMTP ou redirects e não enviou e-mail.
- Para testar localmente, configurar `[auth.email.template.confirmation]`, `subject` e `content_path` em ambiente separado após revisar o arquivo. Referências: https://supabase.com/docs/guides/auth/auth-email-templates e https://supabase.com/docs/guides/local-development/customizing-email-templates . Não alterar SMTP/produção neste trabalho. Personalização no serviço hospedado pode depender do plano/provedor de SMTP.
- Templates de cobrança in-app estão em `apply_billing_lifecycle` (migration 052), com before/due/overdue/suspended/reactivated. Email de cobrança externo não foi conectado, pois canal/remetente/provedor não foram definidos. Se esse canal for exigido, decidir antes de implementar envio.
- Não aplicar Cron/Vault nem cadastrar webhook remoto automaticamente. Worker e oferta/processamento Pix Automático ficam desligados por padrão.

## Bloqueios e decisões externas

1. Sem credenciais/conta Asaas Sandbox configuradas. Não é possível comprovar liquidação, elegibilidade, webhook, latência nem parada de geração de faturas no provedor.
2. Docker não está disponível; stack Supabase/PostgREST completo não foi iniciado. SQL usa schema mínimo controlado; faltam migração integral e testes JWT reais.
3. Pix Automático exige comprovar como o primeiro pagamento referencia a autorização. Descrição exata do contrato, instrução verificada, subscription ID ou vínculo persistido são aceitos; proximidade de cliente/valor/data não é prova. Sem correlação demonstrada, manter oferta desligada. Os schemas públicos não garantem o roundtrip da descrição do QR.
4. Elegibilidade exige evento assinado da conta esperada ou evidência administrativa oficial homologada. A documentação pública consultada não expõe GET de elegibilidade.
5. Nova tentativa/novo QR após cancelamento ou recusa total, renovação de Pix Automático recusado, estorno, chargeback e alteração de dia de cobrança não foram automatizados sem regra comercial. Pagamento preservado não equivale a autorização de renovação.
6. Aceite em produção/dinheiro real requer autorização específica futura. Revisão humana e habilitação comercial permanecem pendentes.

## Checklist de homologação em ambiente isolado

1. Revisar toda a pilha de PRs e executar migrations em cópia isolada com backup/rollback preparado. Conferir acesso de pagantes existentes e APIs com JWT de usuários de workspaces distintos.
2. Configurar somente Sandbox, webhook/token e scheduler/retry. Rodar preflight de leitura; ativar flags apenas no ambiente de homologação e quando cada pré-requisito estiver atendido.
3. Criar CPF inválido/válido, reutilizar cliente, simular timeout/resposta perdida, exigir mesma cobrança/assinatura no retry. Verificar QR/copia-e-cola e expiração.
4. Pagar no Sandbox, repetir/atrasar eventos, forjar payload/token, medir ativação e testar sync; confirmar que consentimento sem pagamento nunca ativa.
5. Conferir cancelamento antes/depois de pagamento e renovação paga com webhook atrasado. Verificar data final, corte temporal e nenhuma fatura nova, mantendo histórico.
6. Simular vencimento e três dias de carência com relógio controlado, verificar avisos únicos e RLS. Pagar atrasado e comprovar reativação automática sem perder dados.
7. Comparar histórico e comprovantes com o painel. Testar confirmação de e-mail, link único/redirect correto e entrega no destinatário controlado; não ativar tracking.
8. Para Pix Automático, comprovar elegibilidade e correlação financeira inicial/recorrente, recusa após pagamento, cancelamento antes de ACTIVE e evento atrasado. Registrar IDs e horários sem expor dados/segredos em PR.
9. Registrar resultados reais, aprovar decisões comerciais e só então definir autorização de promoção/produção. Até lá, manter issues e épico abertos.
