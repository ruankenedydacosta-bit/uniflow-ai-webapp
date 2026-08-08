# UniFlow Observability Foundation V1

Fundacao local e independente de fornecedor para telemetria privacy-first.
Nenhum adapter externo e habilitado por padrao e nenhum emissor existente foi
migrado neste lote.

## Arquitetura

- `telemetryContracts.js`: tipos fechados de eventos, erros e metricas.
- `telemetryContext.js`: environment, release, versao e origem tecnica.
- `telemetryRedaction.js`: allowlist e descarte central de dados proibidos.
- `telemetryPseudonymization.js`: SHA-256 por sessao e por escopo.
- `telemetryAdapters.js`: contrato desacoplado e despacho fail-safe.
- `telemetryClient.js`: API central, desligada por padrao.
- `telemetryRuntime.js`: singleton local usado pelos dominios funcionais.
- `sentryTelemetryAdapter.js`: unico ponto que conhece o SDK do Sentry.
- `telemetryBootstrap.js`: erros globais e recuperaveis do React sem payload.

## Identidade e correlacao

Existem dois conceitos separados e eles nao podem compartilhar a mesma origem.

### Correlacao efemera

O SHA-256 atual com salt aleatorio por sessao atende somente a correlacao
temporaria. O salt fica em memoria, nao e persistido e muda quando um novo
client de telemetria e criado. Assim, o mesmo identificador de entrada produz
pseudonimos diferentes em sessoes diferentes.

Esse mecanismo pode correlacionar eventos tecnicos de uma sessao, mas nao deve
ser tratado como identidade de usuario nem usado para retencao, DAU/WAU/MAU ou
funis entre sessoes. Sem Web Crypto, a correlacao e omitida em vez de usar um
hash fraco.

O Sentry inicial deve usar somente essa correlacao efemera. Nao deve receber um
identificador estavel de usuario.

### Identificador pseudonimo estavel futuro

Analytics longitudinal podera exigir um identificador estavel. Ele nao existe
nesta fundacao e nao deve ser derivado no frontend por hash de e-mail, telefone,
`user_id`, workspace ou qualquer outra PII.

Quando necessario, o identificador devera ser:

- aleatorio e opaco, com pelo menos 128 bits, gerado em ambiente confiavel;
- independente dos IDs funcionais e dos dados pessoais;
- emitido ao frontend sem expor a tabela de correspondencia;
- separado por finalidade e nunca reutilizado entre fornecedores sem revisao;
- revogavel, rotacionavel e removivel junto com consentimento ou conta;
- armazenado em mapeamento privado, sem acesso direto pelo cliente.

A implementacao recomendada e um identificador aleatorio gerado no backend e
obtido por contrato restrito depois da autenticacao. Essa mudanca exigira uma
fase propria de privacidade, banco e consentimento antes de qualquer integracao
de analytics. Um ID aleatorio salvo apenas em `localStorage` identifica a
instalacao, nao o usuario, e nao substitui esse contrato.

## Dados proibidos

Texto de conversa, transcricao, audio, valores e descricoes financeiras, nomes,
e-mails, telefones, documentos, IDs brutos, payloads, tokens, cookies, secrets e
credenciais nunca fazem parte do contrato de saida.

## Adapter Sentry

O Sentry e conectado somente pelo adapter e permanece desligado sem os tres
requisitos simultaneos: `VITE_UNIFLOW_TELEMETRY_ENABLED=true`,
`VITE_SENTRY_ENABLED=true` e `VITE_SENTRY_DSN` HTTPS valido. O DSN nao existe no
codigo e nenhuma configuracao remota foi alterada.

As integracoes automaticas do SDK, breadcrumbs, captura de requests, Session
Replay, auto session tracking e tracing automatico ficam desabilitados. O
adapter recebe apenas envelopes ja sanitizados e usa `beforeSend` como segunda
barreira. Eventos que nao carregam a marca interna da fundacao sao descartados.

O lote inicial cobre apenas erros globais/bootstrap, falhas tecnicas de
sessao/auth e Supabase, voz/microfone, TTS, Edge Functions da voz/Uni e a
orquestracao Shadow da Uni Engine. Latencias sao metricas tecnicas sem payload.
Nenhum resultado altera UI, resposta, fluxo financeiro ou rollout.

## Migracao futura

Os emissores existentes da Uni Engine, voz e runtime financeiro continuam
intactos. A migracao deve ser incremental, dominio por dominio, atras de flags e
com comparacao entre a telemetria antiga e a nova.

## Pendencias obrigatorias antes do primeiro canario

Corrigir, em lote separado, os imports relativos antigos de
`uniEngineContracts.js` em:

- `src/features/uni-engine/financial-runtime/canary/index.js`
- `src/features/uni-engine/financial-runtime/fail-safe/rollbackFinancialRuntimeVisible.js`

Essas pendencias nao foram corrigidas neste lote.
