# UNI OS Prompt Compiler V1

## Objetivo

O Prompt Compiler transforma o Prompt Estruturado aprovado em texto deterministico,
organizado e desacoplado de providers. Ele e a ultima fronteira de representacao
antes de um futuro adapter LLM.

A V1 nao executa IA, adapters, HTTP, SDKs ou APIs externas. Nenhum token real e
consumido.

## Arquitetura

```text
Structured Prompt + Validation Report + Routing Result
                         |
                         v
                 Approval Gate
                         |
          rejected ------+------ approved
             |                       |
             v                       v
   Structured Error          Compiler Policy
                                     |
                                     v
                           Section Formatter
                                     |
                                     v
                           Immutable Compiled Prompt
```

## Fluxo

1. Confirma `validationReport.approved === true`.
2. Valida schema, ordem, duplicidades, routing e deep freeze das entradas.
3. Resolve uma politica local.
4. Formata as onze secoes na ordem oficial.
5. Monta o texto final.
6. Valida preservacao de conteudo e invariantes.
7. Congela profundamente o resultado.

Prompts rejeitados nao sao compilados e retornam `PROMPT_NOT_APPROVED`.

## Secoes

A ordem permanece fixa:

1. `SYSTEM`
2. `CONTEXT`
3. `GOALS`
4. `MEMORY`
5. `INSIGHTS`
6. `CONVERSATION`
7. `REFLECTION`
8. `SECURITY`
9. `PERMISSIONS`
10. `REQUEST`
11. `METADATA`

Cada secao compilada contem titulo, separador, copia exata de `content`, texto
formatado, estimativa original e metadata tecnica. O campo estrutural permite provar
que a serializacao nao alterou os fatos.

## Policies

### STANDARD

Usa titulos Markdown, separador simples, dois espacos de indentacao JSON e intervalo
regular entre secoes.

### COMPACT

Reduz separadores, intervalos e indentacao. Nao remove conteudo.

### DEBUG

Adiciona metadata tecnica da secao ao texto compilado para inspecao local.

### VERBOSE

Usa separadores e espacamento ampliados, com metadata tecnica. Nao adiciona
explicacoes nem altera o conteudo original.

## Schema

O contrato de sucesso possui:

```text
compiledPrompt
  text
  sections
  estimatedTokens
  estimatedCost
  policy
  routing
  statistics
  metadata
version
metadata
```

O contrato bloqueado possui `compiledPrompt: null` e um erro estruturado sem dados do
usuario.

## Validador

O validador garante:

- relatorio previamente aprovado;
- todas as secoes presentes;
- ordem fixa e ausencia de duplicidades;
- routing coerente;
- schema e estatisticas validos;
- conteudo estrutural igual ao original;
- texto compativel com a policy;
- deep freeze;
- invariantes de nao execucao.

## Garantias

- nenhuma correcao ou resumo;
- nenhuma alteracao no Prompt Estruturado;
- nenhuma chamada de adapter ou modelo;
- nenhum conhecimento de SDK ou endpoint;
- nenhuma requisicao HTTP;
- nenhum token consumido;
- nenhuma persistencia;
- resultado provider-agnostic;
- modo sombra e descarte obrigatorio.

## Limitacoes

- estimativas sao copiadas do Prompt Builder;
- nao existe tokenizer real;
- o compilador nao reduz texto para caber no budget;
- metadata DEBUG e VERBOSE aumenta o comprimento textual;
- nenhum adapter consome o resultado nesta etapa.

## Roadmap

O proximo passo previsto e criar o OpenAI Adapter DEV consumindo exclusivamente
`compiledPrompt`. A integracao devera manter credenciais em backend seguro, respeitar
o Prompt Validator e permanecer isolada do frontend e do fluxo legado.
