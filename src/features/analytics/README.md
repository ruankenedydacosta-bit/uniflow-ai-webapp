# Google Analytics 4

Fundação isolada para pageviews manuais e categóricos da SPA.

## Segurança por padrão

- `VITE_GA4_ENABLED` ausente ou diferente de `true` mantém a integração desligada.
- `VITE_GA4_MEASUREMENT_ID` ausente ou inválido mantém a integração desligada.
- Mesmo configurado, o Google Tag não é carregado antes de consentimento explícito.
- A aplicação não interpreta silêncio, navegação, login ou sessão como consentimento.
- O catálogo de páginas é fechado e nunca envia query string, hash ou conteúdo do usuário.
- GA4 não importa nem recebe dados de Supabase ou da observabilidade interna.

A futura interface de consentimento deve chamar `grantGa4AnalyticsConsent()` somente
depois de uma decisão válida. `denyGa4AnalyticsConsent()` mantém novos envios bloqueados.
O módulo não persiste a decisão; a futura camada de consentimento será responsável por
restaurar uma decisão válida a cada inicialização.

## Pendência obrigatória no painel GA4

Antes de ativar a integração em Production, desabilitar manualmente no Web Data Stream
o pageview automático baseado em mudanças de History API/browser history. A integração
usa `send_page_view: false` e emite somente pageviews manuais para evitar duplicação.

O cross-domain já configurado no painel continua responsável pelo linker. O Web App não
remove nem persiste `_gl`; o parâmetro nunca entra em `page_location` ou eventos.

Eventos de produto não fazem parte desta fase.
