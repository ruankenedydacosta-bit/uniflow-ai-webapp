# Homologação técnica Asaas — execução segura

Este roteiro usa somente Supabase isolado e Asaas Sandbox. Nenhuma etapa autoriza produção, catálogo da #114 ou deploy comercial. Pré-requisitos comerciais e impacto da proposta estão em [ASAAS_114_PLAN_IMPACT.md](./ASAAS_114_PLAN_IMPACT.md).

## Ambiente local reproduzível

O CLI global observado é 2.109.1 e não oferece stack nativa. Nesta homologação foi executado o CLI oficial 2.122.0 em diretório temporário, com SHA-256 conferido contra `checksums.txt` da mesma release; nenhuma dependência do aplicativo ou CLI global foi instalada/atualizada.

Disponibilize um CLI >=2.121 por `SUPABASE_HML_CLI` e execute:

```sh
npm run supabase:prepare-billing-homologation
npm run supabase:test-billing-full-stack -- --connection-file /CAMINHO_PRIVADO/connection-private.json
```

O preparador cria projeto local novo com prefixo `uniflow-asaas-hml-` em diretório temporário, runtime nativo, portas próprias e somente serviços necessários. A conexão privada e logs de startup ficam fora do Git com permissão 0600. Não copiar estes arquivos para PRs. `SUPABASE_HML_HOME` pode reutilizar apenas o cache/registry local do runtime; a identidade do projeto e dados continuam separados por diretório.

O validador recusa host remoto e diretório de outro projeto, nunca aceita `--linked`/DATABASE_URL arbitrária e não reseta bancos. Aplica **todas** as migrations de origem, na ordem dos nomes, com psql `ON_ERROR_STOP`; cria fixtures de pagantes antes da 048 e compara os campos anteriores após a cadeia. Não renomeia nem altera SQL para fazê-lo passar. `--resume-local` existe apenas para uma preparação interrompida antes da 048; recusa retomada com migrations de billing já aplicadas. Para repetir, preparar outro ambiente novo.

Antes de qualquer migration, o validador usa o administrador **local** para definir `cron.launch_active_jobs=off`, recarrega e confere numa nova conexão. As migrations históricas 043 e 047 contêm URLs fixas do projeto de produção em jobs. Sem essa barreira, abortar; não executar os jobs nem preencher seus secrets locais. Não alterar os jobs em produção. A rede HTTP do validador/handlers só permite loopback; qualquer tentativa externa aborta. Isso não é o runner de chamadas ao Asaas.

`billing-full-stack-evidence.json` registra horários, SHA-256 de cada migration, hash dos campos preservados, assertivas e tentativas de rede bloqueadas, sem tokens, e-mails, senhas, documentos ou URLs de conexão. Uma cópia sanitizada da execução está em `ASAAS_HOMOLOGATION_LOCAL_EVIDENCE.json`.

Para parar somente o ambiente criado, use o CLI, `runtimeHome` e `project` indicados em `local-runtime.json`, passando `--workdir` do projeto temporário e o mesmo `SUPABASE_HOME`. Use `stop`; não usar `stack destroy` nem apagar dados sem necessidade. `stop` preserva a evidência e o banco local para retomada.

Referências: [runtime nativo](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes), [isolamento por projeto](https://supabase.com/docs/guides/local-development/running-multiple-local-projects), [migrations](https://supabase.com/docs/guides/local-development/database-migrations).

## Segredos e pré-requisitos do provedor

Preencher no gerenciador de segredos do **ambiente de homologação**, nunca por chat, código, commit ou captura de tela:

| Nome | Uso |
| --- | --- |
| `ASAAS_API_KEY` | Chave da conta Sandbox, não de produção |
| `ASAAS_BASE_URL` | Exatamente `https://api-sandbox.asaas.com/v3` |
| `ASAAS_ACCOUNT_ID` | Identidade da conta para conferir eventos/elegibilidade Pix Automático |
| `ASAAS_WEBHOOK_TOKEN` | Segredo próprio usado também no cadastro do webhook Sandbox |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Somente ambiente isolado; a service role nunca chega ao frontend |
| `SUPABASE_HOMOLOGATION_PROJECT_REF` | Obrigatório para reconhecer um destino hospedado; projeto de produção explicitamente recusado pelo preflight |
| `APP_ALLOWED_ORIGINS` | Origem do app de homologação, sem alterar produção |

Manter `UNIFLOW_PIX_AUTOMATIC_ENABLED=false` e `VITE_UNIFLOW_PIX_AUTOMATIC_ENABLED=false`. A variável de processamento automático é separada e só pode ser ligada no ambiente isolado para eventos de teste já provisionados, sem habilitar oferta comercial. Não reaproveitar configuração/token de produção.

Rodar `node scripts/supabase/check-billing-sandbox.mjs`: imprime apenas nomes ausentes/booleans e, se houver a configuração mínima segura, realiza GET da listagem Sandbox. HTTP 200 nessa leitura não prova pagamento. Código 2 indica ausência de configuração; código 1 indica recusa/falha. Nenhum POST financeiro é feito pelo preflight.

A stack local em loopback não recebe Webhooks externos. Para validar entrega real, disponibilizar projeto Supabase de homologação com URL HTTPS acessível pelo Asaas ou um ingresso HTTPS restrito e autorizado para o endpoint de homologação. Não expor toda a stack local à internet. O token do webhook e as chaves ficam no gerenciador de segredos. No acesso atual ao CLI de gerenciamento não foi identificado projeto UniFlow; não usar o projeto de outro produto para esta tarefa.

## Matriz ponta a ponta — atualmente bloqueada por configuração

Usar dados sintéticos e um identificador de execução. Anotar IDs do provedor em evidência privada; no PR publicar apenas hashes/status/horários e resultado de cada critério. Timeout/resposta perdida não autoriza repetir POST de criação: recuperar por GET e vínculo exato; resultado ambíguo exige reconciliação.

| Caso | Execução autorizada somente no Sandbox configurado | Critério/evidência |
| --- | --- | --- |
| Cliente | `billing-create-customer` com CPF de teste inválido/válido e cliente existente | Erro acionável; um vínculo por workspace, sem duplicação em retry |
| Assinatura e QR | `billing-create-subscription` no plano atual, reaproveitar a tentativa | Provider ID único, preço/ciclo do contrato, QR/copia-e-cola reais e expiração |
| Confirmação Pix | Usar simulador Sandbox para a cobrança criada | GET canônico confirma RECEIVED/CONFIRMED, não apenas callback |
| Webhook | Receber evento no HTTPS de homologação e repetir o mesmo ID | Evento persistido antes do efeito; claim único; token/payload forjado não ativa |
| Ativação | Cronometrar confirmação → estado do app e outra sessão | Menos de 60 segundos; sem reload obrigatório, período pago correto |
| Reconciliação | Atrasar entrega, executar sync e consultar estado novamente | Estado igual ao GET do provedor, mantendo acesso do ciclo pago |
| Renovação | Usar fatura de renovação realmente gerada pelo mecanismo Sandbox | Período avança uma vez; evento repetido não cria crédito/dias duplicados |
| Cancelamento | Cancelar pelo app antes de nova geração e após pagamento de renovação atrasado | Provider INACTIVE; faturas existentes preservadas; nenhuma nova fatura; fim de acesso igual à data exibida |
| Inadimplência | Simular vencimento no provedor e homologar fronteiras de carência em ambiente isolado | Data-base é dueDate brasileira; avisos únicos; produto suspenso após três dias, cobrança/histórico disponíveis |
| Regularização | Confirmar pagamento vencido e receber/reconciliar evento | Reativação automática e dados intactos; não inventar data ou valor |
| Histórico | Comparar GET/painel do Asaas e UI do mesmo workspace | IDs/valores/status/datas e comprovantes correspondentes; isolamento entre usuários |

Endpoints oficiais de simulação: [confirmar pagamento](https://docs.asaas.com/reference/confirmar-pagamento), `POST /sandbox/payment/{id}/confirm`; [forçar vencimento](https://docs.asaas.com/reference/forcar-vencimento), `POST /sandbox/payment/{id}/overdue`. Ambos são exclusivos de Sandbox. Forçar status OVERDUE não prova passagem de três dias; conferir dueDate efetiva. Não alterar o relógio global da máquina nem marcar carência externa como aprovada por uma simulação SQL local. Se o provedor não permitir acelerar a geração de renovação/limites temporais, registrar a limitação e os horários a observar; não fabricar fatura avulsa e chamá-la de renovação.

## Pix Automático — homologação separada

A execução local validou RPCs e handlers com Auth/PostgREST reais e fixtures sintéticas. Não comprovou elegibilidade, consentimento bancário nem liquidação no Asaas.

Com as flags de oferta comercial desligadas, verificar primeiro `availability=false` e recusa de `create` no endpoint público. Para testar o provedor sem mudar essa oferta, usar uma jornada de homologação restrita/service-to-service, provisionada somente no ambiente isolado. Nenhum serviço deve gravar autorização como ACTIVE para imitar confirmação do banco.

1. Conferir conta Sandbox e evidência oficial de elegibilidade; não presumir GET público de elegibilidade.
2. Criar a autorização de teste pelo fluxo restrito, conferir cliente/contrato/valor/frequência e persistir o vínculo real. Guardar resposta perdida para recuperação GET; não repetir criação sem correlação.
3. Confirmar pagamento e consentimento separadamente pelos mecanismos oficialmente disponíveis no Sandbox. Se o Sandbox não disponibilizar a simulação necessária, registrar bloqueio de capacidade do provedor.
4. Demonstrar a correlação do **primeiro** pagamento com autorização: instrução verificada, vínculo persistido, subscription ID ou descrição exata preservada. Cliente/valor/data não bastam. Sem prova, parar a liberação de acesso e manter oferta desligada.
5. Comprovar ACTIVE sem pagamento, recebido antes de ACTIVE, recusa após pagamento, cancelamento antes/depois de ACTIVE, evento antigo e recorrência seguinte. Consentimento recusado não apaga período já pago; cancelamento não cria nova cobrança.
6. Confirmar novamente flags comerciais desligadas e nenhum dado de produção tocado. Esses critérios externos continuam pendentes até haver evidência do provedor.
