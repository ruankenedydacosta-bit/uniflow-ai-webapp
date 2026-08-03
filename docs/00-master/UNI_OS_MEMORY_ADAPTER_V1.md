# UNI OS Memory Adapter V1

## Objetivo

O Memory Adapter conecta projeções seguras dos providers de memória existentes
ao UNI OS. A V1 funciona somente em leitura e em modo sombra: organiza memória
válida para observação interna, mas não altera decisões, respostas ou ações da
aplicação.

## Arquitetura

Fluxo atual preparado:

```text
useConversationMemory (leitura)
  -> Memory Adapter
  -> snapshot imutável
  -> provider somente leitura
  -> UNI OS em modo sombra
  -> resultado descartado
```

O adapter compartilha `UNI_OS_ENABLED`, que permanece `false`. Quando a flag é
ativada explicitamente em desenvolvimento, Parser, Context e Memory seguem na
mesma chamada ao orquestrador. O fluxo legado continua sendo a única fonte de
comportamento visível.

## Schema

```js
{
  timestamp,
  explicit: { items: [] },
  conversation: { items: [] },
  financial: {
    accounts: [],
    categories: [],
    merchants: [],
    goals: [],
  },
  preferences: {
    account: [],
    category: [],
    conversation: [],
  },
  metadata: {
    version,
    providers: [],
  },
}
```

O schema faz deep clone antes do deep freeze. Assim, o snapshot entregue ao UNI
OS é profundamente imutável sem congelar objetos pertencentes aos providers.

## Providers suportados

A estrutura aceita projeções de leitura para:

- Explicit Memory;
- Conversation Memory;
- Financial Memory;
- Category Preferences;
- Account Preferences;
- Merchant Mapping;
- Financial Goal Context;
- Conversation Preferences.

Na integração runtime inicial, apenas `useConversationMemory.memoryContext` é
consumido, junto do identificador do workspace atual. As demais entradas já têm
contrato preparado, mas só devem ser ligadas quando seus providers expuserem uma
projeção de leitura equivalente e segura.

## Filtragem

Uma memória só entra no snapshot quando:

- possui tipo permitido na V1;
- tem origem explícita (`explicit_user` ou `user_correction`);
- está em estado `candidate` ou `confirmed`;
- pertence ao workspace atual;
- não expirou e possui data de expiração válida, quando informada;
- possui identificador e valor estruturado válidos.

Memórias inferidas, inativas, expiradas, inválidas ou de outro workspace são
ignoradas. O adapter não usa descrições completas, valores de objetivos ou
outros conteúdos que não sejam necessários ao contrato normalizado.

## Normalização

Categorias, contas, instituições, merchants e objetivos recebem identidade
textual consistente, preservando separadamente o valor de apresentação. Tipos
financeiros desconhecidos são descartados, sem alterar o significado original.

## Garantias

- nenhuma criação, confirmação, inferência, atualização ou persistência;
- nenhuma consulta direta ao Supabase ou API externa;
- isolamento explícito por workspace;
- provider entregue ao UNI OS contém somente `read`;
- resultado do modo sombra sempre descartado;
- falhas do adapter são contidas e não alcançam o fluxo legado;
- logs DEV exibem apenas versão, nomes de providers e contagens.

Os logs nunca incluem frases completas, descrições financeiras, CPFs, cartões,
contas bancárias, tokens, e-mails, telefones ou dados pessoais.

## Limitações da V1

- `UNI_OS_ENABLED` continua desligado;
- o UNI OS ainda não decide nem responde com base nesse snapshot;
- não existe carregamento adicional ou composição assíncrona de providers;
- memória inferida permanece totalmente fora do adapter;
- nenhuma política de escrita ou retenção é criada nesta camada.

## Integração futura

Próximas etapas podem adicionar contratos de leitura para outros providers,
telemetria segura do modo sombra e comparação entre decisões legadas e planos do
UNI OS. Qualquer ativação comportamental deve acontecer separadamente, com testes
de privacidade, isolamento e regressão antes de usar memória em respostas reais.
