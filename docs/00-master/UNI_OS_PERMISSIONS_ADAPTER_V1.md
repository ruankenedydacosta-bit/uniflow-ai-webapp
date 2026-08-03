# UNI OS Permissions Adapter V1

## Objetivo

O Permissions Adapter representa permissões cognitivas sobre os snapshots já
produzidos pelo UNI OS. Ele descreve quais informações podem ser consideradas e
quais propostas podem ser formuladas, sem conceder autorização técnica ou
executar ações.

## Arquitetura

```text
parsedIntent
contextSnapshot
memorySnapshot
planningSnapshot
reflectionSnapshot
securitySnapshot
  -> Permissions Policy
  -> Permissions Engine
  -> Permissions Schema
  -> snapshot imutável com executionAllowed = false
```

O adapter permanece isolado do runtime. Não modifica nem aciona adapters
anteriores.

## Fluxo

1. Identifica scopes cognitivos disponíveis nos snapshots.
2. Converte a decisão de segurança em um status de autorização cognitiva.
3. Deriva restrictions e reasons estruturados.
4. Concede grants somente quando o status é autorizado.
5. Produz um snapshot profundamente imutável.

Nenhum grant representa execução, escrita em banco, chamada de serviço ou acesso
de backend.

## Entradas

- `parsedIntent`;
- `contextSnapshot`;
- `memorySnapshot`;
- `planningSnapshot`;
- `reflectionSnapshot`;
- `securitySnapshot`.

As entradas são somente leitura e permanecem inalteradas.

## Saída

```js
{
  permissionsId,
  timestamp,
  status,
  scopes: [],
  grants: [],
  restrictions: [],
  reasons: [],
  executionAllowed: false,
  metadata: { version },
}
```

O schema filtra todos os valores por allowlists, remove duplicidades e garante
que grants sejam sempre subconjunto dos scopes. `executionAllowed` permanece
internamente fixado em `false`.

## Status

- `AUTHORIZED`: decisão de segurança `ALLOW`;
- `AUTHORIZED_WITH_CONFIRMATION`: decisão `ALLOW_WITH_CONFIRMATION`;
- `NOT_AUTHORIZED`: decisão `BLOCK` com risco ou inconsistência conhecida;
- `UNKNOWN`: decisão ausente, inválida ou bloqueada apenas porque a permissão
  ainda não foi integrada.

Estados `NOT_AUTHORIZED` e `UNKNOWN` nunca recebem grants.

## Scopes cognitivos

- `READ_CONTEXT`;
- `READ_MEMORY`;
- `READ_CONVERSATION`;
- `PROPOSE_FINANCIAL_ACTION`;
- `REQUEST_CONFIRMATION`;
- `READ_PROFILE`.

Scopes indicam somente capacidade cognitiva dentro do snapshot recebido. Eles
não representam roles, JWT claims, RLS, grants SQL ou autorização de API.

## Grants

Grants são códigos pertencentes à mesma allowlist de scopes. Eles apenas
registram que determinada leitura ou formulação cognitiva foi aceita pela
decisão de segurança anterior.

Mesmo `PROPOSE_FINANCIAL_ACTION` permite somente formular uma proposta.
Confirmação e execução permanecem fora desta camada.

## Restrictions

- `CONFIRMATION_REQUIRED`;
- `LOW_CONFIDENCE`;
- `AMBIGUITY_PRESENT`;
- `UNKNOWN_PERMISSION`;
- `HIGH_RISK`;
- `REQUIRED_DATA_MISSING`;
- `CONTEXT_CONFLICT`;
- `STRUCTURAL_CONFLICT`;
- `SECURITY_BLOCKED`.

Restrictions são informativas e nunca corrigem ou completam dados.

## Reasons

- `SECURITY_ALLOWED`;
- `SECURITY_CONFIRMATION_REQUIRED`;
- `SECURITY_BLOCKED`;
- `SECURITY_PERMISSION_UNKNOWN`;
- `SECURITY_DECISION_MISSING`.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Com a flag desligada, nenhum snapshot de
permissões é criado. Quando ativada explicitamente para validação, a decisão é
observada e descartada sem interferir no sistema.

Logs DEV contêm somente status, scopes, restrictions e reasons. Não incluem
texto original, descrições financeiras, valores, CPFs, cartões, e-mails,
telefones ou tokens.

## Garantias

- nenhuma execução ou persistência;
- nenhuma chamada a serviços, Supabase ou APIs externas;
- nenhuma representação de permissão técnica;
- nenhum grant em estado desconhecido ou bloqueado;
- grants sempre limitados aos scopes declarados;
- snapshots de entrada preservados;
- saída profundamente imutável;
- falhas do modo sombra contidas.

## Limitações

- o adapter ainda não participa do runtime;
- não consulta memberships, roles, RLS ou backend;
- não substitui confirmação do usuário;
- não transforma autorização cognitiva em autorização operacional;
- não resolve `PERMISSION_UNKNOWN` nesta etapa.

## Integração futura

Uma etapa futura poderá criar um contrato separado entre permissões cognitivas e
autorização técnica do backend. Essa ponte deverá validar sessão, workspace,
role, consentimento e policies reais sem transportar credenciais para o UNI OS.
Até lá, execução continua proibida por padrão.
