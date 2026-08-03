# Auditoria Final do MVP — UniFlow AI

Data da auditoria: 2026-07-30.
Escopo: auditoria integral de leitura (nenhum código funcional foi alterado). Fluxos de voz e registro financeiro simples foram apenas auditados, não modificados.

## 1. Resumo executivo

O núcleo do produto (autenticação real, financeiro simples, voz, Uni/chat, Bloco E/F de planos multioperação) está funcional e testado (3191/3192 testes passando, única falha pré-existente e não relacionada — ver seção 12). O maior risco para o lançamento **não é um bug de código**, é a ausência de três blocos inteiros de infraestrutura que o produto já promete ao usuário mas não entrega:

1. **Cobrança/assinatura real (Asaas)** — não existe nenhuma integração. O botão "ASSINAR PLANO PESSOAL" é um stub que nunca cobra ninguém e nunca cria uma assinatura real.
2. **Documentos legais (Termos de Uso / Política de Privacidade)** — o checkbox de cadastro pede consentimento para documentos que não existem (o link mostra "será disponibilizado em breve"). Bloqueador de conformidade.
3. **Exclusão de conta (LGPD)** — não existe nenhum caminho, nem visual nem funcional, para o usuário apagar sua conta/dados.

Fora esses três blocos, o produto é surpreendentemente honesto: quase todo "Em breve" encontrado é um rótulo real, testado, com `disabled` genuíno — não há botões mudos, links `#`, ou promessas falsas silenciosas. Uma exceção relevante que permanece é o bug de dados financeiros fictícios na página desktop `/financeiro` (ver Parte 8). A outra — a inconsistência entre o "Plano Pessoal" (R$29,90, feature isolada) e a tabela real de planos (Free/Pro/Business/Enterprise) — **foi resolvida por decisão comercial oficial no Bloco Asaas 0** (ver `PLANO_INTEGRACAO_ASAAS.md`, seção 0.0): "Plano Pessoal" passa a ser o nome exibido para `plan_id='pro'`, reaproveitando a linha já existente em `plans` sem exigir migration de schema.

## 2. Números

- **Total de pendências catalogadas nesta auditoria: 47**
- P0 (bloqueia o lançamento): **7**
- P1 (obrigatório para o MVP): **12**
- P2 (importante, não bloqueia): **14**
- P3 (pós-MVP): **9**
- P4 (remover/ocultar): **5**

(A lista completa de cada prioridade está no `ROADMAP_FECHAMENTO_MVP.md`; aqui ficam apenas P0 e P1 conforme pedido no relatório final.)

## 3. Inventário completo de funcionalidades (Parte 2)

Classificações: 1 Funcional e pronto · 2 Funcional, precisa de polimento · 3 Parcialmente implementado · 4 Apenas visual · 5 Mock/demonstração · 6 Marcado "Em breve" · 7 Quebrado · 8 Não iniciado · 9 Fora do escopo do MVP · 10 Deve ser removido/ocultado

| Módulo | Tela/Função | Arquivo principal | O que funciona | O que falta | Dependências | Risco | Prioridade | Classe |
|---|---|---|---|---|---|---|---|---|
| Auth | Cadastro e-mail/senha | `src/services/authService.js`, `MobileAuthPage.jsx` | `supabase.auth.signUp` real | — | Supabase Auth | Baixo | P1 | 1 |
| Auth | Login e-mail/senha | `authService.js` | Real | — | — | Baixo | P1 | 1 |
| Auth | Login Google | `SessionContext.jsx`, `SocialAuthButtons.jsx` | OAuth real, PKCE, callback | — | Google Cloud OAuth configurado | Baixo | P1 | 1 |
| Auth | Login Apple | `SocialAuthButtons.jsx` | Nada — botão nem existe | Implementar ou remover a menção | Apple Developer account | Médio | P2 | 8 |
| Auth | Recuperação de senha | `ForgotPasswordForm.jsx`, `ResetPasswordPage.jsx` | Real, com mensagem anti-enumeração | — | — | Baixo | P1 | 1 |
| Auth | Confirmação de e-mail | `MobileAuthPage.jsx` | Mensagem informativa após cadastro | Reenvio de confirmação não existe | — | Médio | P2 | 2 |
| Auth | Logout | `SimplifiedAccountPage.jsx` → `SessionContext.jsx` | Real, limpa estado local | — | — | Baixo | P1 | 1 |
| Auth | Exclusão de conta (LGPD) | `SimplifiedAccountSubpagePlaceholder.jsx` | Nada | Fluxo completo (Edge Function + UI) | Service role | **Alto** | **P0** | 8 |
| Onboarding | Wizard 6 passos `/onboarding` | `src/features/onboarding/` | Persiste em `profiles.onboarding_data`/`onboarding_completed_at` (real) | Só é alcançado via login Google — cadastro por e-mail nunca passa por aqui | migration 012 | Alto | **P0** | 3 |
| Onboarding | Apresentação + Plano Pessoal (`/apresentacao`, `/plano-pessoal`) | `presentationStorage.js`, `personalPlanStorage.js` | Fluxo real do cadastro por e-mail | Conclusão só em `localStorage` — nunca grava em `profiles` | — | Alto | **P0** | 3 |
| Perfil | Editar nome/telefone | `SimplifiedEditProfilePage.jsx` | Real (`updateProfile`) | — | — | Baixo | P2 | 1 |
| Perfil | Upload de foto | `SimplifiedEditProfilePage.jsx` | Remoção real | Upload é stub ("não disponível") | Supabase Storage | Médio | P2 | 6 |
| Perfil | Badge "Plano Pessoal" | `SimplifiedAccountPage.jsx` | — | Rótulo fixo, não reflete `plan_id` real — **decisão comercial já tomada (Bloco Asaas 0): o rótulo está correto, é `plan_id='pro'` que precisa ficar consistente com ele, não o contrário** | — | Médio | P1 | 2 |
| Financeiro | Registro simples por voz/texto | `UniChatPage.jsx`, `financialIntentAction.js` | Completo, idempotente, testado (sessões anteriores desta auditoria) | — | RPC `execute_confirmed_financial_action` | Baixo | P1 | 1 |
| Financeiro | Plano multioperação (Bloco E/F) | `pendingFinancialPlan.js` | Completo e testado | — | Edge Function `uni-chat-llm` modo `financial_plan` | Baixo | P1 | 1 |
| Financeiro | Contas, categorias, histórico | `useAccounts`, `useCategories`, `useTransactions` | CRUD real | — | — | Baixo | P1 | 1 |
| Financeiro | Página desktop `/financeiro` | `src/pages/FinanceiroPage.jsx` | CRUD real nos modais | Insights/gráfico de projeção são **dados fictícios fixos**, não os dados reais do usuário | `financial.mock.js` | **Alto** | **P0** | 7 |
| Financeiro | Descrição "Comprei X por R$ Y" | `entityExtractor.js` | Extrai valor/conta | Deixa preposição "por" solta na descrição (ex. "Remédio por") | — | Baixo | P2 | 2 |
| Voz | Push-to-talk (botão grande da Home) | `SimplifiedHomeView.jsx` | Corrigido nesta sessão (pointer capture) | — | — | Baixo | P1 | 1 |
| Voz | Animação reativa ao volume | `useVoiceIntensity.js` | Real, usa RMS do stream | — | — | Baixo | P2 | 1 |
| Voz | Transcrição (OpenAI) | `uni-voice-transcribe` Edge Function | Real, valida origem e workspace | — | `OPENAI_API_KEY` | Baixo | P1 | 1 |
| Voz | TTS (ElevenLabs) | `uni-voice-tts` Edge Function | Real, com cache | — | `ELEVENLABS_API_KEY` | Baixo | P2 | 1 |
| Voz | Custos de produção (LLM/TTS) | — | Sem limite algum hoje | Nenhum rate limit por usuário nas Edge Functions | — | Médio | P1 | 3 |
| Uni/Chat | Roteamento determinístico → financeiro | `financialPlanTrigger.js`, `intentClassifier.js` | Corrigido em sessões anteriores desta auditoria | — | — | Baixo | P1 | 1 |
| Planos | Tabela `plans`/`subscriptions` | migration 001 | Schema e RLS reais, leitura funcional | Sem nenhuma escrita fora de backend (correto, mas não há backend ainda) | — | — | P1 | 2 |
| Planos | Tela "Seu plano" | `SimplifiedPlanPage.jsx` | Lê status real da assinatura | "Economia gerada pela Uni" é texto estático fixo | — | Baixo | P2 | 2 |
| Planos | "Gerenciar assinatura" / "Cancelar assinatura" | `SimplifiedPlanPage.jsx`, `SimplifiedPaymentsPage.jsx` | Modal informativo | Nenhuma ação real | Asaas | Alto | **P0** | 6 |
| Pagamentos | "Plano Pessoal" R$29,90/mês | `src/features/personal-plan/` | UI completa, botão real | `startSubscription()` é stub — não cobra, não persiste assinatura | Asaas | **Crítico** | **P0** | 6 |
| Pagamentos | Forma de pagamento / histórico | `SimplifiedPaymentsPage.jsx` | — | Sempre vazio, sem integração | Asaas | Alto | P1 | 6 |
| Legal | Termos de Uso / Política de Privacidade | `AuthLegalNotice.jsx` | Checkbox exibido | Documentos não existem; link mostra "em breve" | — | **Crítico** | **P0** | 8 |
| Legal | LGPD/cookies | — | Nada | Nenhum conteúdo existe | — | Alto | **P0** | 8 |
| Suporte | Chat/histórico de suporte | `SimplifiedSupportPage.jsx`, tabela `support_requests` | Real | — | — | Baixo | P2 | 1 |
| Suporte | Canal humano | `simplifiedSupportConfig.js` | WhatsApp real (`wa.me`) | Sem e-mail/telefone como alternativa | — | Médio | P2 | 2 |
| CRM/Clientes/Projetos/Agenda (PJ) | — | `ClientesPage.jsx` etc. | CRUD real, testado | Fora do escopo do MVP de lançamento pessoal (mas funcional) | — | Baixo | P3 | 9 |
| Open Finance | Conexão bancária automática | `OpenFinanceConnectionAnimation.jsx` | Schema/tabelas prontos, sem provedor real | Tudo — é 100% "Em breve" honesto | Provedor Open Finance | — | P3 | 6 |
| Segurança | 2FA | `SimplifiedSecurityPage.jsx` | — | "Em breve" honesto | — | — | P3 | 6 |
| Produção | PWA (manifest/service worker) | — | Nada | Tudo — não existe nenhuma infraestrutura PWA | — | Médio | P2 | 8 |
| Produção | Monitoramento de erros | — | Nada | Nenhum Sentry/equivalente | — | Alto | **P0** | 8 |
| Produção | Analytics | — | Nada | Nenhum | — | Médio | P2 | 8 |
| Produção | Headers de segurança (Vercel) | `vercel.json` | Só rewrite SPA | HSTS/CSP/etc ausentes | — | Alto | P1 | 8 |
| Produção | `index.html` metadata | `index.html` | Viewport ok | Título genérico, sem meta description/OG, favicon só SVG | — | Baixo | P2 | 2 |
| Testes | Suíte automatizada | 158 arquivos `*.test.js` | 3191/3192 passando | `npm test` só roda 131/158 arquivos (gap de config) | — | Médio | P1 | 2 |
| Testes | `VoiceManager.test.js` | ver Parte 12 | — | Teste desatualizado (asserção ampla demais), não é bug real | — | Baixo | P2 | 2 |

## 4. Áreas auditadas em detalhe

Os detalhes completos de cada área (Em breve, Asaas, planos, backend, produção, testes) estão nos documentos complementares:

- [`INVENTARIO_EM_BREVE.md`](INVENTARIO_EM_BREVE.md) — toda ocorrência de "Em breve"/incompleto encontrada.
- [`PLANO_INTEGRACAO_ASAAS.md`](PLANO_INTEGRACAO_ASAAS.md) — auditoria de planos + arquitetura completa da integração Asaas.
- [`ROADMAP_FECHAMENTO_MVP.md`](ROADMAP_FECHAMENTO_MVP.md) — classificação P0-P4 completa e roadmap em blocos.
- [`CHECKLIST_PUBLICACAO_MVP.md`](CHECKLIST_PUBLICACAO_MVP.md) — checklist de publicação/produção.

## 5. Backend e Supabase — resumo

23 migrations aplicadas (001 a 023), todas as tabelas com RLS habilitada, sem exceção. Duas migrations corrigiram bugs reais de migrations anteriores (008→009: idempotência incompleta na RPC de transação atômica; 011→019: FK apontando para tabela inexistente `financial_accounts`) — ambas já corrigidas e fechadas, não são pendências. Nenhuma migration pendente de aplicação foi identificada. Nenhuma referência a Asaas/Stripe/provedor de pagamento existe em nenhuma migration ou Edge Function — a integração seria inteiramente nova.

4 Edge Functions existem, todas de IA/voz (`uni-chat-llm`, `uni-voice-tts`, `uni-voice-transcribe`, `generate-uni-premium-voice`). Nenhuma faz rate-limiting por usuário além do repasse do erro 429 do provedor upstream — risco de custo caso o app viralize sem controle.

## 6. Confirmação de escopo

Nenhum código funcional foi alterado nesta execução. Apenas leitura, buscas, e os 5 documentos de auditoria/planejamento foram criados. Nenhuma migration, deploy, commit ou push foi realizado.
