# UNI OS Provider Registry V1

## Objetivo

O Provider Registry representa provedores que poderão participar da futura
orquestração cognitiva do UNI OS. Ele é um catálogo estático, imutável e
desacoplado de integração externa.

Nesta versão nenhum provedor está operacional. Não existem modelos, URLs,
credenciais, autenticação, chamadas HTTP ou consumo de tokens.

## Arquitetura

O módulo está em:

`src/features/uni-os/llm/provider-registry/`

- `providerCatalog.js`: catálogo declarativo dos provedores mock;
- `providerSchema.js`: contrato, catálogos permitidos, clone e deep freeze;
- `providerValidator.js`: integridade individual e do catálogo;
- `providerHealth.js`: leitura determinística do estado de saúde declarado;
- `providerRegistry.js`: criação, consultas e modo sombra;
- `index.js`: API pública;
- `providerRegistry.test.js`: garantias unitárias.

## Providers

A V1 registra:

- `OPENAI`;
- `CLAUDE`;
- `GEMINI`;
- `MISTRAL`;
- `LLAMA_LOCAL`;
- `DEEPSEEK`;
- `QWEN`;
- `CUSTOM`.

Os nomes representam apenas abstrações catalogadas. Eles não indicam conexão,
contrato, disponibilidade real ou seleção para execução.

## Schema

Cada registro contém:

- identidade: `id`, `name` e `type`;
- estado: `status` e `healthStatus`;
- organização futura: `priority` e `fallbackPriority`;
- capacidades: `supportedCapabilities`;
- estimativas relativas: `estimatedLatency` e `estimatedCost`;
- suportes declarados: streaming, visão, voz, saída estruturada e function calling;
- `metadata` estritamente catalogal.

O registry contém `providers`, `version` e `metadata`. O snapshot é produzido
por deep clone e então profundamente congelado, sem congelar o catálogo fonte.

## Status e health

Status permitidos:

- `AVAILABLE`;
- `UNAVAILABLE`;
- `DISABLED`;
- `EXPERIMENTAL`.

Health permitido:

- `UNKNOWN`;
- `HEALTHY`;
- `DEGRADED`;
- `OFFLINE`.

O módulo não mede saúde por rede. `providerHealth.js` apenas normaliza e resume
valores já declarados. Todos os mocks começam com `UNKNOWN`.

## Capabilities

`supportedCapabilities` aceita somente IDs oficiais do Capability Registry.
O Provider Registry consulta esse contrato, mas não altera o catálogo de
capacidades e não escolhe qual provedor deve ser utilizado.

## Validação

Antes de criar o snapshot, o validator garante:

- IDs oficiais e únicos;
- prioridades e prioridades de fallback únicas;
- nome e campos obrigatórios;
- status, health, tipo, custo e latência permitidos;
- capabilities existentes;
- flags booleanas explícitas;
- metadata estruturada.

Falhas geram `ProviderRegistryValidationError` com códigos controlados. No modo
sombra, falhas são contidas e nenhum snapshot escapa para o fluxo da aplicação.

## Fluxo

```text
Provider Catalog
      |
      v
Provider Validator
      |
      v
Immutable Provider Registry
      |
      v
Shadow observer (resultado descartado)
```

`UNI_OS_ENABLED` permanece `false`. Mesmo quando o modo sombra é habilitado em
teste, o resultado observado não altera runtime, UX ou qualquer decisão.

## Garantias

- nenhum modelo é conhecido ou selecionado;
- nenhuma URL ou endpoint é armazenado;
- nenhuma credencial ou token existe;
- nenhuma autenticação é realizada;
- nenhuma chamada HTTP ou API ocorre;
- nenhum prompt ou texto é gerado;
- nenhum módulo existente é integrado ou modificado;
- todos os snapshots públicos são imutáveis.

## Limitações

As capacidades declaradas são hipóteses catalogais para arquitetura e testes.
Elas ainda não comprovam disponibilidade comercial, técnica ou contratual. Os
status e health não representam monitoramento real.

## Roadmap

1. Criar Routing Policies determinísticas e independentes de integração.
2. Criar Model Router representacional sobre capabilities, providers e policies.
3. Definir contratos seguros de configuração fora do frontend.
4. Integrar provedores somente em uma fase futura, com autorização explícita,
   backend seguro, observabilidade e limites de custo.

