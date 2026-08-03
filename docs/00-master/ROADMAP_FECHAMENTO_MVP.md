# Roadmap de Fechamento do MVP — UniFlow AI

Data: 2026-07-30. Estimativas por complexidade (pequeno/médio/grande/muito grande), nunca por horas.

## Parte 13 — Classificação final (47 itens)

### P0 — Bloqueia o lançamento (7)

1. **Exclusão de conta (LGPD)** — não existe nenhum caminho para o usuário apagar conta/dados. `src/features/simplified-app/` (placeholder), precisa de Edge Function com service-role.
2. **Termos de Uso / Política de Privacidade** — checkbox de consentimento aponta para documentos inexistentes. `AuthLegalNotice.jsx`, `MobileAuthPage.jsx`.
3. **Assinatura real (Asaas)** — botão "ASSINAR PLANO PESSOAL" é um stub que nunca cobra ninguém. `src/features/personal-plan/startSubscription.js`.
4. **Dados financeiros fictícios em `/financeiro` (desktop)** — a página mostra insights e um gráfico de projeção fixos (`financial.mock.js`) em vez dos dados reais do usuário, mesmo quando os hooks reais já estão disponíveis no mesmo componente. `src/pages/FinanceiroPage.jsx`.
5. **Onboarding real não é alcançado pelo caminho principal de cadastro** — o wizard que persiste em `profiles.onboarding_data`/`onboarding_completed_at` só é acionado via login Google; o cadastro por e-mail (majoritário) usa um fluxo paralelo (`/apresentacao` → `/plano-pessoal`) cuja conclusão só existe em `localStorage`, nunca no banco.
6. **Nenhum monitoramento de erros em produção** — sem Sentry/equivalente, uma falha real em produção só é descoberta por relato manual do usuário.
7. **Badge "Plano Pessoal" fixo** — mostra o mesmo rótulo independente do plano real da assinatura; some enganosamente mal com a introdução de planos reais via Asaas se não for corrigido junto.

### P1 — Obrigatório para o MVP (12)

1. Arquitetura e implementação completa da integração Asaas (ver `PLANO_INTEGRACAO_ASAAS.md`) — telas de forma de pagamento, instrução de pagamento, pendente/confirmado.
2. ~~Resolver a divergência "Plano Pessoal" vs. tabela `plans`~~ — **RESOLVIDO por decisão comercial oficial no Bloco Asaas 0** (`PLANO_INTEGRACAO_ASAAS.md` 0.0): identificador `pro`, sem migration necessária para isso. Resta só o ajuste técnico em `personalPlanConfig.js` (trocar `PERSONAL_PLAN_ID` de `'personal'` para `'pro'`).
3. Reenvio de e-mail de confirmação (hoje inexistente).
4. Decisão sobre Apple Sign-In: implementar de verdade ou remover o código morto (`getSocialUnavailableResult`).
5. Rate limiting por usuário nas Edge Functions de IA/voz (custo de produção sem controle hoje).
6. Headers de segurança no `vercel.json` (HSTS, CSP, X-Content-Type-Options, Referrer-Policy).
7. Corrigir `npm test` para rodar os 158 arquivos de teste (hoje só roda 131 — 27 ficam de fora, incluindo o único que falha).
8. Canal de suporte redundante (e-mail, já que WhatsApp é hoje o único canal humano).
9. README.md real (hoje é o boilerplate padrão do Vite, sem instruções do projeto).
10. `index.html`: título, meta description, Open Graph, favicon completo (ico + PNG + apple-touch-icon).
11. Confirmar política de backup/PITR do Supabase e documentá-la (hoje é um checklist não confirmado, não uma política).
12. Corrigir a descrição financeira que deixa a preposição solta ("Remédio por") — polimento pequeno, mas do fluxo P1 (financeiro).

### P2 — Importante, mas não bloqueia (14)

1. Upload real de foto de perfil.
2. Preferências extras de perfil ("como deseja ser chamado", "forma de tratamento", "tamanho do texto").
3. "Economia gerada pela Uni" com cálculo real em vez de texto estático.
4. Analytics de produto (PostHog/GA/Amplitude/Vercel Analytics).
5. PWA completo (manifest, ícones, service worker) — ou decisão explícita de não fazer PWA no MVP.
6. `package.json`: versão além de `0.0.0`, campo `engines`.
7. Corrigir o teste `VoiceManager.test.js` (asserção ampla demais, não é bug de produto — ver Parte 12 do relatório final).
8. Cobertura de teste para `src/components/ui/*` (Button, Card, Input, etc. — hoje zero).
9. Cobertura de teste para `SafeMarkdown` (renderização de conteúdo, relevante para sanitização).
10. Throttling client-side em login/cadastro (cooldown visual, complementando o rate limit do Supabase Auth).
11. Estados de erro adicionais no bootstrap de sessão (perfil/workspace parcialmente carregado).
12. Ampliar o histórico "Ver histórico completo" hoje sempre `disabled` em Pagamentos (depende de #1 do P1, mas o polimento de UX é P2).
13. Limpar diretório vazio `src/pasta sem título/` e `src/pages/objetivos/` (mock sem página real).
14. Revisar `src/pages/open-finance/` (diretório vazio).

### P3 — Pós-MVP (9)

1. Autenticação de dois fatores (2FA).
2. Open Finance (conexão bancária automática) — schema já existe, sem provedor.
3. Assistente "Perguntar à Uni" dentro de CRM/Clientes/Projetos/Relatórios/Agenda (módulos PJ).
4. Troca de plano (upgrade/downgrade) além do fluxo básico do Asaas.
5. Automações financeiras avançadas.
6. Recursos Business/Enterprise adicionais além do que já existe.
7. Integrações secundárias (novas instituições, novos provedores de voz).
8. Conciliação automática agendada (job periódico) para billing.
9. Apple Sign-In, caso a decisão do P1 seja "adiar" em vez de "remover".

### P4 — Remover ou ocultar no MVP (5)

1. `getSocialUnavailableResult` em `authMobileSchema.js` — código morto, nunca chamado (só se a decisão for "remover", não "implementar").
2. `src/pages/objetivos/objectives.mock.js` — mock sem página real associada.
3. Diretório vazio `src/pasta sem título/`.
4. Diretório vazio `src/pages/open-finance/`.
5. Botões "Perguntar à Uni" nos módulos PJ, **se** a decisão de lançamento for MVP pessoal-somente (mantê-los visíveis com "Em breve" é aceitável; escondê-los é uma alternativa igualmente válida — decisão de produto, não técnica).

## Parte 14 — Roadmap executável em blocos

A ordem abaixo segue a prioridade pedida: (1) bloqueadores de segurança/dados, (2) autenticação real, (3) planos e Asaas, (4) ativação/assinatura, (5) funções centrais, (6) remoção de "Em breve", (7) estados de erro, (8) aspectos legais, (9) produção, (10) polimento final.

### Bloco 1 — Correção de dados fictícios e monitoramento (segurança/dados)
- **Objetivo:** eliminar o único caso real de dado financeiro fictício exibido como se fosse real, e ganhar visibilidade de erros em produção antes de qualquer outro trabalho.
- **Arquivos:** `src/pages/FinanceiroPage.jsx`, remover/gating de `financial.mock.js`; adicionar SDK de monitoramento (ex. Sentry) em `src/app/main.jsx`.
- **Banco:** nenhum.
- **Integrações:** SDK de error tracking (nova dependência).
- **Testes:** atualizar `FinanceiroPage.test.js` para garantir que os dados exibidos vêm dos hooks reais, nunca do mock, em produção.
- **Risco:** baixo (troca de fonte de dados já disponível no mesmo componente).
- **Dependências:** nenhuma.
- **Resultado esperado:** `/financeiro` mostra sempre o saldo/histórico real do usuário; erros de produção chegam a um painel monitorado.
- **Critério de conclusão:** teste que falha se `financial.mock.js` for importado fora de contexto de teste; primeiro evento de erro real aparece no painel de monitoramento.

### Bloco 2 — Autenticação e onboarding real
- **Objetivo:** garantir que TODO caminho de cadastro (não só Google) persista onboarding no backend, e resolver a decisão do Apple Sign-In.
- **Arquivos:** `src/features/onboarding/`, `src/features/presentation/`, `src/features/personal-plan/personalPlanStorage.js`, `src/app/App.jsx` (roteamento pós-cadastro), `src/features/auth-mobile/authMobileSchema.js`.
- **Banco:** nenhuma migration nova necessariamente — reaproveitar `profiles.onboarding_data`/`onboarding_completed_at` (migration 012) para o caminho de e-mail também.
- **Integrações:** nenhuma nova.
- **Testes:** cobrir que o cadastro por e-mail também grava `onboarding_completed_at` real.
- **Risco:** médio (mexe no fluxo de roteamento pós-cadastro, hoje aprovado — exige atenção para não regredir o fluxo já funcional).
- **Dependências:** nenhuma.
- **Resultado esperado:** qualquer novo usuário (e-mail ou Google) tem onboarding persistido no Supabase, não só em localStorage.
- **Critério de conclusão:** um novo cadastro por e-mail, seguido de logout/login em outro navegador, preserva o estado de onboarding concluído.

### Bloco 3 — Planos e Asaas (arquitetura + implementação)
- **Objetivo:** implementar a arquitetura descrita em `PLANO_INTEGRACAO_ASAAS.md`.
- **Arquivos:** novas Edge Functions (`billing-*`), `src/features/personal-plan/startSubscription.js` (substituir o stub pela chamada real), novas telas de forma de pagamento/instrução de pagamento.
- **Banco:** novas tabelas `billing_customers`, `billing_payments`, `webhook_events`; alteração em `subscriptions` (`asaas_subscription_id`, `payment_method` sem boleto, `cancel_at_period_end`); ampliar `check constraint` de `subscriptions.status` para incluir `suspended` (regra oficial de inadimplência, Bloco Asaas 0). **Não precisa mais alterar `plans`** — "Plano Pessoal" já está resolvido como `plan_id='pro'`.
- **Integrações:** Asaas (sandbox primeiro, depois produção).
- **Testes:** idempotência do webhook, todos os fluxos de exceção da Parte 6 do `PLANO_INTEGRACAO_ASAAS.md`.
- **Risco:** **alto** — envolve dinheiro real, webhook, e é o maior bloco novo do projeto.
- **Dependências:** conta Asaas configurada (sandbox e produção), decisão de produto sobre o "Plano Pessoal".
- **Resultado esperado:** um usuário consegue assinar de verdade, pagar via Pix/boleto/cartão, e ter o plano liberado automaticamente após confirmação.
- **Critério de conclusão:** um pagamento real em sandbox percorre o fluxo completo (checkout → webhook → `subscriptions.status='active'` → recursos liberados) sem intervenção manual.

### Bloco 4 — Ativação e controle de assinatura
- **Objetivo:** popular "Gerenciar assinatura", "Cancelar assinatura", histórico de pagamentos com dados reais (depende do Bloco 3).
- **Arquivos:** `SimplifiedPlanPage.jsx`, `SimplifiedPaymentsPage.jsx`.
- **Banco:** leitura das tabelas do Bloco 3.
- **Integrações:** `billing-cancel-subscription`, `billing-change-plan`.
- **Testes:** cancelamento real, reativação, downgrade/upgrade.
- **Risco:** médio.
- **Dependências:** Bloco 3 concluído.
- **Resultado esperado:** as duas telas deixam de ser só estado vazio/modal informativo.
- **Critério de conclusão:** cancelar a assinatura em produção reflete `status='canceled'` na tela em até o tempo do próximo webhook/consulta manual.

### Bloco 5 — Funções centrais do MVP (validação, não nova construção)
- **Objetivo:** confirmar que financeiro simples, Bloco E/F e voz — já funcionais — seguem sem regressão após os blocos anteriores.
- **Arquivos:** nenhum alterado; só validação.
- **Banco:** nenhum.
- **Integrações:** nenhuma nova.
- **Testes:** suíte financeira e de voz completas (já verde).
- **Risco:** baixo.
- **Dependências:** Blocos 1-4.
- **Resultado esperado:** nenhuma regressão nos fluxos já aprovados.
- **Critério de conclusão:** suíte completa continua 100% verde (exceto o item já identificado no Bloco 6).

### Bloco 6 — Remoção/ocultação de "Em breve" obsoletos
- **Objetivo:** resolver os itens do P4 (código morto, diretórios vazios) e decidir o destino dos módulos PJ "Perguntar à Uni" para o escopo do MVP pessoal.
- **Arquivos:** ver lista do P4 acima.
- **Banco:** nenhum.
- **Integrações:** nenhuma.
- **Testes:** remover/atualizar os testes que hoje travam esses trechos como "Em breve" honesto, se removidos.
- **Risco:** baixo.
- **Dependências:** decisão de produto sobre escopo PJ no lançamento.
- **Resultado esperado:** repositório sem código morto nem diretórios vazios.
- **Critério de conclusão:** `find src -type d -empty` vazio; nenhuma referência a `getSocialUnavailableResult` (se removido).

### Bloco 7 — Estados de erro
- **Objetivo:** cobrir o caso de sessão parcialmente carregada (perfil ok, workspace falhou) com um estado de erro explícito em vez de renderizar a casca autenticada com dados nulos.
- **Arquivos:** `src/app/App.jsx`, `src/app/SessionContext.jsx`.
- **Banco:** nenhum.
- **Integrações:** nenhuma.
- **Testes:** simular falha parcial de rede no bootstrap de sessão.
- **Risco:** médio.
- **Dependências:** nenhuma.
- **Resultado esperado:** falha parcial de rede nunca deixa o usuário numa tela quebrada silenciosa.
- **Critério de conclusão:** teste cobrindo o cenário "perfil ok, workspace/subscription falha" mostra uma mensagem de erro visível, nunca uma tela em branco.

### Bloco 8 — Aspectos legais
- **Objetivo:** publicar Termos de Uso e Política de Privacidade reais, e construir o fluxo de exclusão de conta.
- **Arquivos:** novas páginas/rotas de Termos/Privacidade; nova Edge Function de exclusão de conta; `AuthLegalNotice.jsx` (trocar o `onLegalClick` stub pelos links reais).
- **Banco:** nenhuma tabela nova necessariamente (a exclusão usa Supabase Admin API via service-role).
- **Integrações:** nenhuma externa.
- **Testes:** links reais, fluxo de exclusão com confirmação explícita.
- **Risco:** **alto** (jurídico/conformidade, não técnico).
- **Dependências:** conteúdo jurídico real (redigido por quem tem competência para isso — fora do escopo técnico desta auditoria).
- **Resultado esperado:** checkbox de cadastro aponta para documentos reais; usuário consegue solicitar exclusão de conta.
- **Critério de conclusão:** os dois documentos existem em rota pública; a exclusão de conta remove os dados conforme a política definida.

### Bloco 9 — Produção
- **Objetivo:** fechar os itens de `CHECKLIST_PUBLICACAO_MVP.md`.
- **Arquivos:** `vercel.json`, `index.html`, `README.md`, `package.json`.
- **Banco:** confirmar política de backup.
- **Integrações:** analytics (opcional), PWA (opcional/decisão).
- **Testes:** nenhum novo necessariamente — validação manual do checklist.
- **Risco:** baixo.
- **Dependências:** nenhuma.
- **Resultado esperado:** checklist de publicação 100% resolvido ou explicitamente adiado com decisão registrada.
- **Critério de conclusão:** ver `CHECKLIST_PUBLICACAO_MVP.md`.

### Bloco 10 — Polimento final
- **Objetivo:** os itens de P2 que sobrarem (avatar, preferências de perfil, "economia gerada pela Uni", cobertura de teste em `src/components/ui/*`).
- **Arquivos:** conforme item.
- **Banco:** nenhum, em geral.
- **Integrações:** nenhuma.
- **Testes:** cobertura nova onde hoje é zero.
- **Risco:** baixo.
- **Dependências:** nenhuma.
- **Resultado esperado:** produto mais polido, sem pendência bloqueante.
- **Critério de conclusão:** item a item, conforme a lista de P2.

## Estimativas por complexidade (resumo)

| Bloco | Complexidade |
|---|---|
| 1 — Dados fictícios + monitoramento | Pequeno |
| 2 — Auth/onboarding real | Médio |
| 3 — Asaas | **Muito grande** |
| 4 — Ativação/assinatura | Médio |
| 5 — Validação sem regressão | Pequeno |
| 6 — Remoção de "Em breve" obsoletos | Pequeno |
| 7 — Estados de erro | Pequeno |
| 8 — Legal | Grande (jurídico) / Médio (técnico) |
| 9 — Produção | Médio |
| 10 — Polimento | Pequeno a médio, item a item |
