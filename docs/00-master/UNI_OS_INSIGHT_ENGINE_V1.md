# UNI OS Insight Engine V1

## Objetivo

O Insight Engine identifica oportunidades de orientação, alertas e sugestões a partir de snapshots estruturados do UNI OS. Ele não gera linguagem natural, não envia mensagens e não executa recomendações.

## Arquitetura

O módulo vive isolado em `src/features/uni-os/cognitive/insights`.

- `insightDetector.js`: identifica sinais estruturais.
- `insightPolicy.js`: converte sinais em insights codificados e calcula score.
- `insightPrioritizer.js`: ordena deterministicamente.
- `insightSchema.js`: valida, clona e aplica deep freeze.
- `insightEngine.js`: coordena detecção, fallback e modo sombra.
- `index.js`: API pública local.

Não existe integração com Runtime, Inspector, providers, Supabase ou interfaces.

## Tipos

- `GOAL_PROGRESS`;
- `GOAL_DELAY`;
- `SPENDING_PATTERN`;
- `INCOME_PATTERN`;
- `INVESTMENT_OPPORTUNITY`;
- `EMERGENCY_RESERVE`;
- `RECURRING_EXPENSE`;
- `CATEGORY_CONCENTRATION`;
- `MEMORY_CONFLICT`;
- `CONTEXT_CHANGE`;
- `NO_INSIGHT`.

## Critérios

A V1 detecta somente condições explícitas:

- objetivo ativo com prazo vencido;
- objetivo ativo entre 80% e 99% de progresso;
- objetivo ativo de investimento;
- reserva de emergência abaixo de 50%;
- memórias ranqueadas de recorrência ou padrão;
- sinal de categoria em padrão de gastos;
- metadata explícita de conflito de memória;
- mudança de contexto declarada;
- incompatibilidade entre objetivo empresarial e workspace pessoal.

## Score e prioridade

Cada tipo possui score-base. Confiança e severidade adicionam até 10 pontos cada, e intenção compatível adiciona 5. O resultado é limitado entre 0 e 100.

- `LOW`: abaixo de 35;
- `NORMAL`: 35 a 69;
- `HIGH`: 70 a 89;
- `CRITICAL`: 90 ou mais.

Empates usam prioridade, confiança e ordem original. Nenhum score dos snapshots recebidos é alterado.

## Schema

```js
{
  insights: [{
    insightId,
    type,
    priority,
    confidence,
    score,
    trigger,
    title,
    description,
    recommendedAction,
    reasons,
  }],
  primaryInsight,
  metadata,
}
```

`title`, `description` e `recommendedAction` são códigos em caixa alta, não frases. A futura camada de comunicação poderá interpretá-los em etapa separada. Sem sinais, o engine retorna somente `NO_INSIGHT`.

## Fluxo

```text
Snapshots somente leitura
  -> detectar sinais
  -> aplicar política e score
  -> priorizar
  -> clonar e congelar
  -> snapshot de insights
```

## Modo sombra

`runInsightEngineShadow()` compartilha `UNI_OS_ENABLED`, que continua desligada. Quando habilitado explicitamente, entrega o snapshot ao observador e descarta o resultado. Nenhuma informação chega ao usuário.

## Garantias

- nenhuma IA ou API externa;
- nenhuma geração de texto ou voz;
- nenhuma criação ou alteração de meta, memória ou contexto;
- nenhuma persistência ou execução;
- nenhuma notificação ao usuário;
- entradas permanecem intactas;
- saída profundamente imutável;
- IDs de insight determinísticos.

## Limitações

A V1 reconhece somente os sinais presentes nos contratos atuais. Não interpreta histórico bruto, não calcula projeções financeiras e não resolve conflitos. Insights são oportunidades estruturadas, não decisões nem recomendações finais.

## Roadmap

Etapas futuras podem integrar o engine ao Runtime em modo sombra, ampliar telemetria explicável e conectar os códigos à camada de comunicação. Qualquer ativação visível exige revisão de segurança, produto e linguagem sem ansiedade.
