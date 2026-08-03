# UNI OS Prompt Builder V1

## Objetivo

O Prompt Builder transforma a janela de conversa, o orcamento cognitivo, a decisao
representacional de roteamento e o contexto compilado em um unico prompt estruturado.
A V1 nao gera respostas, nao executa modelos, nao chama adapters, nao faz HTTP e nao
consome tokens reais.

## Arquitetura

Fluxo somente leitura:

```text
Conversation Window + Token Budget + Routing Result + Compiled Context
                              |
                              v
                       Prompt Sections
                              |
                              v
                    Deterministic Assembler
                              |
                              v
                    Schema + Local Validator
                              |
                              v
                    Immutable Structured Prompt
```

O resultado permanece representacional. `executionAllowed` e sempre falso nos
invariantes e nenhum adapter LLM e chamado nesta etapa.

## Secoes

A ordem e fixa e todas as secoes sao obrigatorias:

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

Cada secao possui `id`, `title`, `priority`, `estimatedTokens`, `content` e
`metadata`. O conteudo continua estruturado; o builder nao cria texto final nem
resumo em linguagem natural.

## Assembler

O assembler percorre exclusivamente o catalogo de secoes em ordem fixa. A estimativa
e deterministica e aproximada, reutilizando o estimador estrutural do Token Budget.
O orcamento informa a capacidade destinada a cada secao, mas nao remove, resume ou
trunca informacoes da Conversation Window.

As secoes `SYSTEM`, `REQUEST` e `METADATA` representam overhead estrutural e recebem
estimativa propria. As demais mantem a correspondencia com as oito secoes do Token
Budget.

## Validador

O validador local garante:

- as onze secoes presentes, unicas e na ordem oficial;
- prioridades e estimativas validas;
- soma deterministica das estimativas;
- metadados obrigatorios de cada secao;
- versao e invariantes representacionais;
- congelamento profundo do snapshot inteiro.

Este validador cobre o contrato estrutural da V1. A proxima etapa podera adicionar
uma auditoria semantica e de seguranca antes que qualquer adapter consuma o prompt.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Quando habilitado explicitamente em validacao,
`runPromptBuilderShadow()` monta o snapshot, permite observacao tecnica opcional e
descarta o resultado. O fluxo legado permanece como unica fonte de verdade.

Logs de desenvolvimento mostram somente quantidade de secoes, estimativas e dados
representacionais de roteamento. O conteudo integral do prompt nunca e registrado.

## Garantias

- nenhuma entrada e modificada ou congelada pelo builder;
- o resultado usa copia defensiva e deep freeze;
- nenhuma secao obrigatoria pode faltar ou aparecer duplicada;
- nenhuma resposta, prompt textual livre ou raciocinio e gerado;
- nenhum modelo, provider ou adapter e executado;
- nenhuma API, SDK, persistencia ou chamada de rede e utilizada;
- nenhum token real e consumido.

## Limitacoes

- estimativas nao usam tokenizer real;
- o builder nao reduz contexto para caber no orcamento;
- `selectedProvider` continua apenas representacional;
- nao existe validacao semantica externa;
- o Mock Adapter ainda nao consome este resultado nesta etapa.

## Roadmap

O proximo passo e criar o Prompt Validator dedicado, auditando o prompt estruturado
antes que qualquer adapter possa recebe-lo. A integracao posterior deve comecar pelo
LLM Adapter Mock e manter modelos reais fora do fluxo ate haver validacao completa.
