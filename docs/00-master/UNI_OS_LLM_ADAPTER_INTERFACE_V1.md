# UNI OS LLM Adapter Interface V1

## Objetivo

A LLM Adapter Interface define o contrato único que todo futuro adapter deverá
implementar. Esta etapa contém apenas schema, catálogo de métodos e validação
estrutural. Nenhum adapter concreto foi criado.

## Arquitetura

O módulo está em `src/features/uni-os/llm/adapter-interface/`:

- `llmAdapterInterface.js`: criação do descriptor e modo sombra;
- `adapterCapabilities.js`: capabilities oficiais aceitas;
- `adapterContracts.js`: catálogo dos métodos obrigatórios;
- `adapterSchema.js`: contrato, clone e deep freeze;
- `adapterValidator.js`: validação de descriptors e implementações futuras;
- `index.js`: API pública;
- `llmAdapterInterface.test.js`: garantias unitárias.

## Contrato

Todo futuro adapter deverá expor:

1. `initialize()`;
2. `dispose()`;
3. `healthCheck()`;
4. `supportsCapability()`;
5. `estimateCost()`;
6. `estimateLatency()`;
7. `buildRequest()`;
8. `invoke()`;
9. `validateResponse()`.

Esta interface nunca chama os métodos. O validator verifica apenas se cada chave
é uma função. Implementação, argumentos, efeitos e ciclo de vida permanecem para
etapas futuras.

## Schema

O snapshot contém `adapterInterface`, `version` e `metadata`.
`adapterInterface` possui:

- `name` e `version`;
- `supportedCapabilities`;
- flags de streaming, visão, voz, saída estruturada e function calling;
- metadata declarativa.

O snapshot passa por deep clone e deep freeze. A definição fonte não é congelada.
A interface abstrata oficial possui lista vazia de capabilities, pois ela não
representa suporte operacional próprio.

## Validação

O validator garante:

- nome e versão obrigatórios;
- capabilities existentes e sem duplicidades;
- flags booleanas explícitas;
- metadata estruturada;
- versão correta do contrato;
- snapshot profundamente imutável;
- presença dos nove métodos obrigatórios em implementações futuras.

Falhas de definição geram `LLMAdapterInterfaceValidationError` com códigos
controlados. No modo sombra, elas são contidas em `FAILED_SAFE`.

## Garantias

- nenhum adapter concreto existe nesta etapa;
- nenhum método do contrato é executado pela interface ou validator;
- nenhuma request real é construída;
- nenhum provider ou modelo é conhecido ou chamado;
- nenhuma API, SDK, URL ou endpoint existe;
- nenhuma credencial, autenticação ou token existe;
- nenhum token é consumido;
- `UNI_OS_ENABLED` permanece `false`;
- o modo sombra descarta o descriptor;
- nenhum fluxo existente é alterado.

## Roadmap

1. Criar o LLM Adapter Mock implementando exatamente este contrato.
2. Validar ciclo de vida e requests exclusivamente simulados.
3. Conectar o mock ao Model Router ainda em modo sombra.
4. Definir segurança e observabilidade antes de qualquer adapter real.

