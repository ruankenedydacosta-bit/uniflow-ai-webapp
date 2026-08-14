# Google Analytics 4

Fundação isolada para pageviews manuais e categóricos da SPA.

## Segurança por padrão

- `VITE_GA4_ENABLED` ausente ou diferente de `true` mantém a integração desligada.
- `VITE_GA4_MEASUREMENT_ID` ausente ou inválido mantém a integração desligada.
- Mesmo configurado, o Google Tag não é carregado antes de consentimento explícito.
- A aplicação não interpreta silêncio, navegação, login ou sessão como consentimento.
- O catálogo de páginas é fechado e nunca envia query string, hash ou conteúdo do usuário.
- GA4 não importa nem recebe dados de Supabase ou da observabilidade interna.

## Consentimento Basic

A arquitetura usa **tag gating**: não cria `dataLayer`, não carrega `gtag.js` e não envia
requests antes da autorização. Ela não emite os comandos formais
`gtag('consent', 'default', ...)` ou `gtag('consent', 'update', ...)`. Essa decisão mantém
fora do escopo o Advanced Consent Mode e seus cookieless pings/modelagem; em troca, o
Google não recebe sinais formais de Consent Mode para este Web App.

A interface de consentimento chama `grantGa4AnalyticsConsent()` somente depois de a
pessoa escolher **Aceitar Analytics**. A escolha **Recusar Analytics** chama
`denyGa4AnalyticsConsent()` e mantém novos pageviews bloqueados.

A decisão categórica (`granted` ou `denied`) é persistida no Web App com a chave
`uniflow:analytics-consent:v1`. Nenhum identificador de usuário, workspace ou conteúdo
do produto faz parte desse armazenamento. Na ausência de decisão, o estado continua
`unknown` e o Google Tag não é carregado.

Se o armazenamento local estiver indisponível, a escolha vale somente na sessão atual e
a aplicação continua funcionando. Ao revogar uma autorização, a camada bloqueia novos
pageviews e futuros eventos e ativa o sinal `ga-disable-<measurement-id>` para interromper
a coleta do Google Tag já carregado. Como o script não pode ser descarregado com
segurança, cookies GA já criados podem permanecer até a expiração definida pelo
navegador/Google. A implementação não remove cookies genéricos, storage funcional ou
sessão da UniFlow.

A preferência pode ser alterada em **Conta > Privacidade e Analytics**, sem recarregar a
página. O pageview categórico da rota atual é emitido pelo observador existente assim que
uma autorização válida ativa o cliente.

## Pendência obrigatória no painel GA4

Antes de ativar a integração em Production, desabilitar manualmente no Web Data Stream
o pageview automático baseado em mudanças de History API/browser history. A integração
usa `send_page_view: false` e emite somente pageviews manuais para evitar duplicação.

O cross-domain já configurado no painel continua responsável pelo linker. O Web App não
remove nem persiste `_gl`; o parâmetro nunca entra em `page_location` ou eventos.

Eventos de produto não fazem parte desta fase.
