# Checklist de Publicação do MVP — UniFlow AI

Data: 2026-07-30. Cada item marca o estado encontrado nesta auditoria — nada foi corrigido nesta execução.

## Ambiente e variáveis

- [x] `.env.example` existe e está sincronizado com o que o app realmente consome (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_UNI_PREMIUM_VOICE_DEMO_ENABLED`, `VITE_APP_URL`) — nenhuma divergência encontrada.
- [ ] Secrets de Edge Functions (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) — confirmar que estão configurados no projeto de **produção** do Supabase, não só no de desenvolvimento (não verificável por leitura de repositório).
- [ ] Secret da Asaas (`ASAAS_API_KEY`) — não existe ainda; depende do Bloco 3 do roadmap.

## Vercel

- [x] `vercel.json` existe com rewrite SPA correto.
- [ ] Headers de segurança (`Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) — ausentes, precisam ser adicionados.
- [x] `.vercelignore` correto (exclui `.env*`, `node_modules`, `supabase/.temp`, etc.).
- [x] Domínio/projeto já linkado (`app-uniflow-ai-oficial`).

## Domínio e HTTPS

- [x] Nenhuma URL de produção hardcoded encontrada fora do esperado (config via env).
- [ ] Confirmar certificado HTTPS do domínio final (gerenciado pelo Vercel, não verificável por leitura de repositório).

## PWA

- [ ] `manifest.json`/`manifest.webmanifest` — não existe.
- [ ] Ícones em múltiplos tamanhos (192x192, 512x512, apple-touch-icon) — só existe `favicon.svg`.
- [ ] Service worker — não existe.
- **Decisão necessária:** incluir PWA no MVP ou adiar explicitamente para pós-lançamento.

## Aspectos legais e consentimento

- [ ] Política de Privacidade — não existe (link mostra "em breve").
- [ ] Termos de Uso — não existe (link mostra "em breve").
- [ ] Consentimento de cookies — não existe conteúdo nenhum.
- [ ] Exclusão de conta (LGPD) — não existe fluxo nenhum.

## Suporte e contato

- [x] Canal de suporte in-app real (`support_requests`, Supabase).
- [x] Canal humano real (WhatsApp via `wa.me`).
- [ ] Canal humano redundante (e-mail/telefone) — inexistente; WhatsApp é ponto único de falha.

## Monitoramento e observabilidade

- [ ] Monitoramento de erros (Sentry ou equivalente) — inexistente.
- [ ] Analytics de produto — inexistente.
- [ ] Logs estruturados nas Edge Functions — já existem em `uni-chat-llm`; replicar o padrão para futuras funções de billing.

## Backup e recuperação

- [ ] Confirmação formal do plano/tier do Supabase e sua política real de backup/PITR — hoje é um item de checklist não marcado em `SUPABASE_EXISTING_PROJECT_AUDIT.md`, não uma política documentada.

## Limites de uso e proteção de APIs

- [ ] Rate limiting por usuário nas Edge Functions de IA/voz — inexistente (só repasse do 429 do provedor upstream).
- [x] `uni-voice-transcribe` já valida origem (`APP_ALLOWED_ORIGINS`) e workspace membership — bom padrão a replicar nas demais funções.
- [ ] Proteção contra abuso de cadastro/login (throttling client-side) — inexistente (depende também do rate limit nativo do Supabase Auth, não auditável por leitura de repositório).

## Configuração de produção da Asaas

- [ ] Toda a integração — inexistente hoje (ver `PLANO_INTEGRACAO_ASAAS.md`).
- [ ] Ambiente sandbox configurado e testado antes de produção.
- [ ] Webhook de produção apontando para a Edge Function correta, com validação de autenticidade configurada.

## `index.html` e metadados

- [ ] `<title>` ainda é o padrão do Vite (`uniflow-ai-app`) — trocar para "UniFlow AI".
- [ ] Meta description ausente.
- [ ] Open Graph / Twitter Card ausentes (compartilhamento em redes sociais/WhatsApp não mostra preview).
- [ ] Favicon só em SVG — faltam `.ico` e `apple-touch-icon`.

## Documentação do projeto

- [ ] `README.md` é o boilerplate padrão do Vite — não documenta setup, variáveis de ambiente, nem como rodar os testes deste projeto específico.
- [x] Documentação profunda existe em `docs/00-master/`, mas não é referenciada a partir do README raiz.

## Testes

- [x] Suíte completa: 3191/3192 passando.
- [ ] `npm test` só executa 131 dos 158 arquivos de teste existentes — reconciliar a lista do script com `find src -name "*.test.js"` antes do lançamento, para que a suíte de CI reflita o repositório real.
- [ ] `VoiceManager.test.js` — 1 teste falhando por asserção regex ampla demais (não é bug de produto, ver relatório final); decidir explicitamente se corrige a asserção antes do lançamento ou aceita a falha conhecida.

## Confirmação de execução desta auditoria

- [x] Nenhuma migration foi aplicada.
- [x] Nenhum `db push` foi executado.
- [x] Nenhum deploy foi feito.
- [x] Nenhum secret foi alterado.
- [x] Nenhum commit ou push foi feito.
- [x] Nenhuma refatoração ou correção automática foi aplicada.
- [x] Fluxo de voz e financeiro não foram alterados — apenas auditados.
