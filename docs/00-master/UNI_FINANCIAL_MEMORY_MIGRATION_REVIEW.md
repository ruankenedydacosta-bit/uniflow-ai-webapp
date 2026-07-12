# Uni Financial Memory Migration Review

## Escopo

Esta revisão cobre `20260711_005_uni_financial_memory.sql` antes de qualquer aplicação no Supabase UniFlow DEV.

Nenhuma migration foi executada, nenhuma conexão remota foi feita e produção permanece intacta. A revisão foi estática e local.

## Resultado

Status: **aprovada localmente após correções, pendente de aplicação e validação no UniFlow DEV**.

A migration permanece dentro de `BEGIN`/`COMMIT`, depende das migrations 001–004 e reutiliza helpers existentes:

- `public.set_updated_at()` da migration 001;
- `public.is_workspace_member(uuid, text[])` da migration 001;
- unicidade composta de `accounts(workspace_id, id)` e `transactions(workspace_id, id)` preparada pela migration 004.

Não foram encontrados nomes iguais aos helpers das migrations anteriores. Os nomes novos usam prefixos específicos de memória.

## Problemas encontrados e correções

### Leitura ampla demais no workspace

Problema: qualquer membro ativo, inclusive owner/admin, conseguia ler memórias pessoais de outros usuários do mesmo workspace.

Correção: memórias agora exigem simultaneamente membership ativa e `user_id = auth.uid()`. Evidências somente aparecem quando pertencem a uma memória do próprio usuário.

Nesta V1 não existe memória compartilhada de equipe. Caso seja necessária no futuro, deverá ter escopo explícito separado.

### Metadados privilegiados graváveis pelo frontend

Problema: inserts permitiam enviar `user_id`, `confidence`, status, confirmação, timestamps e expiração.

Correção: o grant de insert foi reduzido a:

- `workspace_id`;
- `memory_type`;
- `memory_key`;
- `memory_value`;
- `source`.

`user_id` vem de `auth.uid()`. Confiança, status, confirmação e timestamps recebem defaults/valores controlados pelo banco. O trigger de insert reforça essas regras.

O service recebe o objeto de sessão e extrai exclusivamente `sessionContext.workspace.id`; não oferece parâmetro separado para escolher workspace ou `user_id`.

### Tipos inferidos disponíveis ao frontend

Problema: a constraint reconhecia tipos explícitos e inferidos, mas RLS e trigger não os separavam.

Correção: frontend pode inserir somente:

- `category_preference`;
- `account_preference`;
- `merchant_category_mapping`;
- `financial_goal_context`;
- `conversation_preference`.

Reservados ao backend seguro:

- `recurring_income`;
- `recurring_expense`;
- `spending_pattern`;
- qualquer tipo derivado futuro.

Origem `user_correction` é limitada a `merchant_category_mapping` nesta versão.

### Updates diretos e promoção arbitrária

Problema: grant de update em status/confirmado permitia tentar promover candidatos por alteração genérica.

Correção: não existe mais grant direto de `UPDATE` para `authenticated`. Foram criadas duas RPCs controladas:

- `decide_uni_financial_memory`: confirma ou rejeita memória própria em estado permitido;
- `correct_uni_explicit_memory`: corrige apenas fatos explícitos próprios e retorna o item ao estado candidate.

Ambas validam sessão, membership, titularidade, estado e escopo. Memórias `rejected`, `expired` ou `superseded` não podem ser reativadas por essas RPCs.

### Sanitização sem limites estruturais

Problema: a função era recursiva, mas não limitava profundidade, quantidade de itens ou tamanho total.

Correção:

- profundidade máxima: 8;
- máximo de 64 chaves por objeto;
- máximo de 50 itens por array;
- `memory_value`: até 16 KiB;
- `evidence_summary`: até 8 KiB;
- bloqueio recursivo de chaves relacionadas a token, segredo, senha, credencial, certificado, chave privada, payload bruto, áudio, transcrição e atributos sensíveis proibidos.

A função continua `SECURITY INVOKER`, imutável e com `search_path` vazio.

### Integridade de expiração e supersessão

Problema: status `expired` e `superseded` não possuíam relação estrutural suficiente.

Correção:

- `expired` exige `expires_at`;
- `superseded` exige `superseded_by_id` diferente do próprio ID;
- a substituição precisa pertencer ao mesmo workspace;
- unicidade passou a proteger apenas memórias ativas (`candidate`/`confirmed`), permitindo histórico rejeitado ou superseded sem duas memórias ativas iguais.

O PostgreSQL não deve usar `now()` em CHECK para expiração dinâmica. A mudança automática para `expired` continua responsabilidade futura do backend.

### Exclusão de referências financeiras

Problema: apagar transação ou conta removia evidências em cascata.

Correção: referências financeiras são opcionais e passam a `NULL` apenas na coluna removida. O resumo sanitizado e a ligação com a memória permanecem. Apagar a própria memória continua removendo suas evidências, respeitando o direito de exclusão.

## Modelo final de permissões

### `uni_financial_memories`

- `SELECT`: somente titular com membership ativa no workspace.
- `INSERT`: somente titular, papel owner/admin/member, tipos explícitos e origem permitida.
- `UPDATE`: nenhum grant direto ao frontend.
- decisões: RPC específica para confirmar/rejeitar.
- correção: RPC específica para fatos explícitos.
- `DELETE`: somente titular owner/admin/member.

Viewer pode ler a própria memória, mas não inserir, decidir, corrigir ou apagar.

### `uni_memory_evidence`

- `SELECT`: somente se a memória pai pertence ao usuário autenticado e o workspace está ativo.
- nenhuma escrita frontend;
- criação automática futura reservada ao backend seguro;
- origem registrada separadamente do tipo da evidência;
- FK composta impede associar evidência a memória, conta ou transação de outro workspace.

## Grants

- `anon`: nenhum grant nas duas tabelas ou RPCs.
- `authenticated`: select próprio, insert em cinco colunas explícitas, delete próprio e execute nas duas RPCs controladas.
- `authenticated`: sem update direto e sem escrita em evidências.
- `service_role`: previsto apenas para backend futuro; nunca para frontend.

## Privacidade

Não existem colunas para:

- access/refresh token;
- segredo, senha ou credencial;
- certificado ou chave privada;
- áudio;
- transcrição completa;
- payload bruto Open Finance.

`memory_value` e `evidence_summary` são objetos JSON pequenos, sanitizados recursivamente e restritos ao domínio financeiro. Dados de saúde, religião, política e diagnósticos emocionais são proibidos.

## Falha parcial

`uni_financial_memory_failed_apply_audit.sql` classifica o estado como:

- `no_005_objects_found`;
- `partial_005_schema_manual_review_required`;
- `all_005_objects_found_review_before_reapply`.

Não existe DROP automático. Como a migration usa uma transação explícita, a execução integral tende a fazer rollback em caso de erro, mas o audit deve ser executado antes de qualquer reaplicação se houver dúvida sobre a forma usada no SQL Editor.

## Checklist antes de aplicar no DEV

- [ ] Confirmar que migrations 001–004 estão aplicadas e validadas.
- [ ] Confirmar os índices `accounts_workspace_id_id_uidx` e `transactions_workspace_id_id_uidx`.
- [ ] Confirmar versão PostgreSQL compatível com `ON DELETE SET NULL (coluna)`.
- [ ] Revisar a migration 005 e este documento.
- [ ] Fazer backup/snapshot apropriado do ambiente DEV.
- [ ] Confirmar que a execução será somente no UniFlow DEV.
- [ ] Não usar chave de produção nem expor service role.

## Checklist após eventual falha

- [ ] Executar `uni_financial_memory_failed_apply_audit.sql`.
- [ ] Ler a classificação retornada.
- [ ] Não executar DROP automático.
- [ ] Inventariar tabelas, índices, constraints, triggers, policies e funções.
- [ ] Corrigir/limpar manualmente somente após revisão específica.
- [ ] Reaplicar a migration completa apenas quando o estado estiver conhecido.

## Checklist de validação após aplicação

- [ ] Executar `uni_financial_memory_validation.sql` e exigir todos os checks booleanos verdadeiros.
- [ ] Confirmar duas tabelas, sete FKs e índices esperados.
- [ ] Confirmar RLS nas duas tabelas.
- [ ] Confirmar quatro policies restritas.
- [ ] Confirmar ausência de grant anon e update direto authenticated.
- [ ] Confirmar cinco colunas de insert frontend.
- [ ] Confirmar RPCs de decisão e correção.
- [ ] Testar usuário titular autenticado.
- [ ] Testar outro membro do mesmo workspace sem acesso à memória alheia.
- [ ] Testar workspace diferente sem acesso.
- [ ] Testar viewer somente leitura da própria memória.
- [ ] Testar bloqueio de tipo inferido e JSON proibido.
- [ ] Confirmar que produção não foi acessada.

## Riscos pendentes

- RLS real ainda precisa de teste com cliente autenticado; SQL Editor como postgres não valida policies.
- Expiração automática e fluxo transacional de supersessão ainda exigem backend seguro.
- A política jurídica de retenção/auditoria precisa ser definida antes de dados reais regulados.
- A versão PostgreSQL do DEV deve ser confirmada para a ação referencial por coluna.
- Não existe memória compartilhada de equipe nesta V1.

## Confirmação

A migration 005 continua **não aplicada**. Nenhum projeto Supabase remoto foi acessado durante esta auditoria.
