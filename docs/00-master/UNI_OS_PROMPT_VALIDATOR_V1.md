# UNI OS Prompt Validator V1

## Objetivo

O Prompt Validator audita o Prompt Estruturado antes que qualquer adapter possa
consumi-lo. Ele nao corrige, reorganiza, remove ou completa informacoes. A saida e
somente um relatorio estruturado e imutavel.

Nenhum modelo, adapter, SDK, HTTP ou API externa participa desta etapa.

## Arquitetura

```text
Structured Prompt + Routing Result + Token Budget
                         |
                         v
                  Deterministic Audit
                         |
                         v
                Validation Report Builder
                         |
                         v
             Immutable Validation Report
```

O modulo e independente do validador estrutural interno do Prompt Builder. O builder
garante que consegue produzir seu contrato; o Prompt Validator faz a auditoria de
fronteira antes do futuro consumo por adapters.

## Fluxo

1. Recebe os tres snapshots somente leitura.
2. Audita estrutura e invariantes do prompt.
3. Compara orcamento por secao com o Token Budget.
4. Confirma capability no Capability Registry.
5. Confirma provider representacional no Provider Registry.
6. Compara prompt e Routing Result.
7. Verifica metadados e deep freeze dos snapshots.
8. Produz e congela o relatorio.

Nenhuma etapa modifica os snapshots recebidos.

## Regras

A V1 valida:

- schema e versao;
- onze secoes obrigatorias;
- ordem fixa e ausencia de duplicidades;
- prioridades e estimativas validas;
- soma das estimativas;
- alocacao e disponibilidade de budget por secao;
- capability registrada e coerente;
- routing consistente;
- provider registrado, representacional e compativel;
- metadados de nao execucao;
- integridade e congelamento profundo.

Uma estimativa de custo ausente gera warning. Inconsistencias de schema, budget,
routing, capability, provider ou imutabilidade impedem aprovacao.

## Niveis

- `INFO`: observacao tecnica sem impacto na aprovacao.
- `WARNING`: risco nao bloqueante que deve ser conhecido pelo proximo estagio.
- `ERROR`: erro que impede aprovacao.
- `BLOCKING`: violacao de contrato ou seguranca que impede consumo.

## Relatorio

O contrato possui:

```text
validationReport
  status
  issues
  warnings
  statistics
  approved
  metadata
version
metadata
```

Status suportados:

- `APPROVED`
- `APPROVED_WITH_WARNINGS`
- `REJECTED`

`approved` nunca significa autorizacao para executar um modelo ou uma acao. Ele
indica apenas que o snapshot pode seguir para a proxima camada offline.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Quando habilitado explicitamente em testes,
o relatorio e observado e descartado. O fluxo legado permanece como unica fonte de
verdade.

Logs DEV mostram somente status, quantidades agregadas de warnings e erros, e o
resultado booleano de aprovacao. O conteudo integral do prompt nunca e registrado.

## Garantias

- auditoria deterministica e sem efeitos colaterais;
- nenhuma correcao silenciosa;
- nenhuma alteracao no Prompt Builder;
- nenhuma chamada de adapter, modelo ou API;
- nenhum token real consumido;
- nenhum dado persistido;
- relatorio com deep freeze;
- execucao sempre proibida.

## Roadmap

O proximo passo e integrar offline Model Router, Conversation Window, Token Budget,
Prompt Builder, Prompt Validator e LLM Adapter Mock. O adapter somente podera receber
um prompt com relatorio aprovado, ainda sem qualquer provider real.
