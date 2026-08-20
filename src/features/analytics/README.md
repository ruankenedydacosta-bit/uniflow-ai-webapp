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
pessoa escolher **Permitir**. A escolha **Não permitir** chama
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

## Contrato de eventos de produto

Todos os eventos passam pelo gateway fechado em `ga4ProductContracts.js`. Parâmetros
desconhecidos são descartados e valores fora do catálogo invalidam a emissão.

| Evento | Condição canônica | Payload permitido |
|---|---|---|
| `login` | sessão por senha sincronizada ou retorno Google confirmado | `method: password\|google` |
| `sign_up` | identidade nova por e-mail/senha confirmada | `method: password` |
| `sign_up_viewed` | entrada real no modo de cadastro, após hidratação do consentimento | nenhum |
| `voice_started` | início real do `MediaRecorder` | `interaction_mode: voice_button` |
| `voice_completed` | terminal único da interação iniciada | `result: success\|cancelled\|error`, `interaction_mode: voice_button` |
| `transaction_created` | nova persistência financeira confirmada, sem replay | `direction: entry\|exit`, `origin: manual\|voice` |
| `calendar_event_created` | nova agenda persistida, sem replay | `origin: manual\|voice`, `schedule_kind: all_day\|timed` |
| `begin_checkout` | abertura do modal de checkout | nenhum |
| `payment_method_selected` | confirmação do método no botão “Confirmar assinatura” | `payment_type: pix\|card` |
| `pix_generated` | payload PIX completo retornado pelo backend | nenhum |
| `card_checkout_created` | URL válida do checkout hospedado retornada pelo backend | nenhum |
| `subscription_activated` | frontend observa `pending → active`, inclusive no retorno do cartão | nenhum |

`payment_method_selected` mantém o nome histórico, mas sua semântica oficial é
**método confirmado para uma tentativa de checkout**, não simples mudança do rádio.
Criar um segundo evento quebraria a continuidade do funil sem acrescentar informação
útil ao ponto canônico atual.

## Cadastro Google

O callback OAuth atual não contém prova segura de que a identidade Google acabou de ser
criada. Por isso, cadastro novo e acesso recorrente via Google emitem somente
`login {method: "google"}`. `sign_up` mede exclusivamente cadastro novo por e-mail/senha;
nenhuma heurística de rota, texto de botão ou estado visual deve inferir cadastro Google.

## Retorno do checkout de cartão

Antes do redirecionamento externo, a aplicação grava em `sessionStorage` apenas o estado
categórico `pending`. No retorno, uma confirmação `active` consome esse marcador antes
do envio. Isso cobre o caso em que o primeiro polling já chega ativo e impede duplicação
por polling, reload ou remontagem. Uma leitura inicial `active` sem marcador e sem uma
transição observada não emite. Cancelamento/expiração confirmados removem o marcador.

O marcador não contém IDs, valores, CPF/CNPJ ou dados do checkout. Falhas de storage ou
GA4 são fail-open para o produto. Consentimento continua obrigatório e não há replay de
eventos bloqueados.

## Escopo de ambiente

O emissor continua protegido por `VITE_GA4_ENABLED`, measurement ID válido e
consentimento. O dashboard deve aplicar `hostName` canônico em todas as consultas:
eventos acima pertencem ao hostname de produção do app; `cta_click` pertence somente
aos hostnames públicos da landing. Preview, `localhost` e outros hosts não entram nos
KPIs executivos.
