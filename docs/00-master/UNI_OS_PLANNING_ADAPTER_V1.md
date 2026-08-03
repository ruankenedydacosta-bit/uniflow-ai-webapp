# UNI OS Planning Adapter V1

## Objetivo

O Planning Adapter transforma intenção, contexto e memória já normalizados em
um plano cognitivo estruturado. Ele representa uma possível sequência de
raciocínio, sem executar, persistir ou autorizar qualquer ação.

## Arquitetura

```text
parsedIntent + contextSnapshot + memorySnapshot
  -> Planning Adapter
  -> Planning Planner
  -> Planning Schema
  -> plano imutável com executionAllowed = false
```

A camada é independente do planning engine inicial do orquestrador. Nesta etapa,
ela oferece um contrato preparado para observação em modo sombra, sem ser ligada
ao comportamento runtime e sem modificar Parser, Context Adapter ou Memory
Providers.

## Entradas

- `parsedIntent`: intenção e entidades estruturadas pelo Parser Adapter;
- `contextSnapshot`: contexto somente leitura da sessão e workspace;
- `memorySnapshot`: projeção de memória somente leitura do workspace atual.

O adapter não altera nem congela essas entradas. Contexto e memória permanecem
fontes auxiliares: na V1, somente a correspondência explícita de uma conta na
memória pode trocar a representação `create_account_candidate` por
`reuse_account`.

## Saída

```js
{
  planId,
  timestamp,
  intent,
  confidence,
  requiresConfirmation,
  executionAllowed: false,
  steps: [
    { id, type, description, status },
  ],
  metadata: { version },
}
```

O schema clona os passos antes do deep freeze. `executionAllowed` é definido
internamente como `false` e não pode ser ativado pela entrada.

## Tipos de passos

- `identify_account`;
- `identify_category`;
- `identify_amount`;
- `identify_date`;
- `ask_confirmation`;
- `create_account_candidate`;
- `reuse_account`;
- `reactivate_account_candidate`;
- `persist_transaction`;
- `respond_question`;
- `inform_user`.

Os passos são descrições de planejamento. Mesmo `persist_transaction` representa
somente uma possibilidade futura após confirmação, segurança e permissões.

`reactivate_account_candidate` está reservado no schema, mas não é produzido na
V1 porque o snapshot seguro de memória não contém contas inativas.

## Regras por atenção

- ação financeira: identifica entidades, exige confirmação e representa a ação;
- pergunta financeira: organiza consulta e orientação;
- conversa casual: prepara resposta breve;
- planejamento: prepara orientação consultiva;
- configuração: exige confirmação e informa a proposta;
- emergência: prepara orientação clara, calma e não executável;
- explicação ou entrada desconhecida: usa plano consultivo seguro.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Com a flag desligada, nenhum plano sombra é
gerado. Quando ativado explicitamente para validação, o adapter permite observar
o plano e descarta o resultado retornado ao fluxo.

Logs de desenvolvimento incluem apenas intent, tipos de passos, necessidade de
confirmação e `executionAllowed`. Não registram texto original, descrições
financeiras, valores, cartões, CPFs, tokens, e-mails ou telefones.

## Garantias

- nenhuma execução de ações;
- nenhuma persistência ou consulta ao Supabase;
- nenhuma chamada a serviços financeiros ou APIs externas;
- nenhuma alteração de providers, reducers ou snapshots;
- plano profundamente imutável;
- falhas do modo sombra contidas;
- confirmação não equivale a permissão de execução.

## Limitações

- o adapter ainda não participa do runtime da aplicação;
- reflection não é entrada desta etapa;
- não valida permissões nem segurança operacional;
- não decide se uma conta arquivada deve ser reativada;
- não gera linguagem natural nem resposta ao usuário.

## Integração futura

Uma etapa posterior poderá entregar este plano ao Reflection Adapter e comparar
seus sinais com o planejamento legado em modo sombra. Qualquer influência sobre
o fluxo real exigirá validação separada de confirmação, segurança, permissões e
regressão financeira.
