# UNI OS Reflection Adapter V1

## Objetivo

O Reflection Adapter analisa criticamente o plano cognitivo produzido pelo
Planning Adapter. A V1 identifica ambiguidades, ausências, conflitos e
inconsistências sem corrigir dados, modificar o plano ou executar ações.

## Arquitetura

```text
parsedIntent
contextSnapshot
memorySnapshot
planningSnapshot
  -> Reflection Analyzer
  -> Reflection Schema
  -> reflexão imutável com executionAllowed = false
```

O adapter é uma camada isolada. Não está conectado ao runtime da aplicação e
não altera Parser, Context Adapter, Memory Adapter ou Planning Adapter.

## Entradas

- `parsedIntent`: intenção e entidades estruturadas;
- `contextSnapshot`: sessão e workspace somente leitura;
- `memorySnapshot`: memória consolidada somente leitura;
- `planningSnapshot`: plano imutável produzido anteriormente.

Nenhum snapshot é alterado ou congelado pelo Reflection Adapter. A memória é
aceita no contrato para análise futura, mas não gera inferências na V1.

## Saída

```js
{
  reflectionId,
  timestamp,
  overallRisk,
  confidence,
  confirmationRequired,
  ambiguityDetected,
  inconsistencies: [],
  recommendations: [],
  executionAllowed: false,
  metadata: { version },
}
```

O schema faz deep clone das inconsistências antes do deep freeze. O campo
`executionAllowed` é sempre definido internamente como `false`.

## Análises da V1

- plano vazio;
- divergência entre intent do plano e intent interpretado;
- tentativa de permitir execução no plano;
- conta, categoria, valor ou data ausentes em ações financeiras;
- múltiplas contas ou categorias possíveis;
- conflito entre IDs comparáveis de workspace;
- baixa confiança;
- confirmação ainda necessária.

A análise nunca escolhe uma alternativa, preenche um campo ou reescreve o plano.

## Classificação de risco

- `LOW`: plano consistente, confiança adequada e nenhuma ambiguidade;
- `MEDIUM`: informação ausente ou confiança insuficiente;
- `HIGH`: plano vazio, múltiplas opções, conflito de contexto ou inconsistência
  interna que possa comprometer segurança.

A confiança permanece entre `0` e `1`. Ela parte da confiança do plano ou da
intenção e recebe penalidades determinísticas por inconsistências encontradas.

## Recomendações

- `ASK_CONFIRMATION`;
- `REQUEST_ACCOUNT`;
- `REQUEST_CATEGORY`;
- `REQUEST_DATE`;
- `REQUEST_AMOUNT`;
- `REQUEST_DISAMBIGUATION`;
- `PROCEED_AFTER_CONFIRMATION`.

Recomendações são códigos estruturados. Elas não executam ações e não equivalem
a permissão. `PROCEED_AFTER_CONFIRMATION` só aparece quando o plano exige
confirmação e nenhuma inconsistência foi encontrada.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Com a flag desligada, nenhuma reflexão sombra
é criada. Quando ativado explicitamente para validação, o adapter permite
observar a reflexão e descarta o resultado sem interferir no sistema.

Logs DEV contêm somente risco, confiança, recomendações e flags agregadas. Não
incluem texto original, descrições financeiras, valores, CPFs, cartões, tokens,
e-mails ou telefones.

## Garantias

- nenhuma execução ou persistência;
- nenhuma chamada a serviços, Supabase ou APIs externas;
- nenhuma alteração de planos ou providers;
- snapshots de entrada preservados;
- saída profundamente imutável;
- falhas do modo sombra contidas;
- risco e recomendações determinados por regras explícitas.

## Limitações

- a reflexão ainda não participa do runtime;
- não usa OpenAI ou qualquer modelo cognitivo;
- não corrige ambiguidades automaticamente;
- não valida grants ou policies de segurança;
- memória não influencia conclusões na V1;
- nomes de workspace não são comparados com UUIDs sem identidade equivalente.

## Integração futura

Uma etapa posterior poderá alimentar Security e Permissions com os sinais da
reflexão. A ativação comportamental só deve ocorrer depois de validar o pipeline
completo em modo sombra, preservando confirmação explícita e bloqueio de
execução por padrão.
