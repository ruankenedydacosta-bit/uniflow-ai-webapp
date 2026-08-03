# UNI OS Parser Adapter V1

## 1. Objetivo

O Parser Adapter V1 traduz a saida existente de `parseFinancialText` para um
contrato unico, imutavel e preparado para consumo pelo UNI OS.

O parser permanece inalterado e continua sendo a fonte do fluxo atual. O UNI OS
recebe uma copia normalizada somente em modo sombra, descarta seu proprio
resultado e nao influencia resposta, memoria, confirmacao ou execucao.

## 2. Fluxo

```text
Texto ou transcricao final
  -> parser atual
  -> resultado interno atual
  -> Parser Adapter
  -> parsedIntent
  -> uniOS.process()
  -> Attention
  -> Planning
  -> Reflection
  -> resultado descartado

Em paralelo:
resultado interno atual
  -> memoria e fluxo financeiro atuais
  -> resposta atual, sem mudanca
```

Com `UNI_OS_ENABLED=false`, o adapter retorna `DISABLED` antes de normalizar ou
chamar o orchestrator. Esta e a configuracao da V1 entregue.

## 3. Estrutura

```text
src/features/uni-os/adapters/
  index.js
  parser/
    parserAdapter.js
    parserNormalizer.js
    parserIntentSchema.js
    parserAdapter.test.js
    README.md
    index.js
```

O adapter importa somente o orchestrator do UNI OS. Ele nao importa React,
Supabase, voz, memoria ou services financeiros.

## 4. Schema parsedIntent

```json
{
  "id": "intent-uuid",
  "timestamp": "2026-07-12T18:00:00.000Z",
  "source": "text",
  "language": "pt-BR",
  "intent": "register_expense",
  "confidence": 0.96,
  "entities": {
    "accounts": [],
    "categories": [],
    "merchants": [],
    "values": [],
    "dates": [],
    "workspaces": []
  },
  "requiresConfirmation": true,
  "actionType": "expense",
  "metadata": {
    "schemaVersion": "1.0",
    "parserVersion": "1.0",
    "ready": true,
    "missingEntities": [],
    "errorCodes": []
  }
}
```

O objeto, suas colecoes e entidades sao copias profundamente congeladas. O
adapter nunca congela ou modifica objetos pertencentes ao parser.

O schema nao inclui texto bruto, `normalizedInput`, descricao financeira,
sessao, usuario ou identificadores operacionais do workspace.

## 5. Normalizacao

### Entidades nomeadas

Contas, categorias, merchants e workspaces usam:

```json
{
  "type": "account",
  "normalized": "nubank",
  "display": "Nubank"
}
```

Normalizacao:

- caixa baixa;
- remocao de diacriticos;
- espacos internos consistentes;
- deduplicacao pela identidade normalizada;
- preservacao separada do texto de apresentacao.

`mercado`, `Mercado` e `MERCADO` convergem para `mercado`.

### Valores

`R$85`, `85 reais` e `85` convergem para `85`. Valores seguem numero decimal
com ate duas casas. Entradas invalidas nao sao promovidas a entidade.

### Datas

O formato unico e `YYYY-MM-DD`, ja utilizado pelo parser atual. O normalizador
aceita tambem `Hoje`, `Ontem`, `Amanha` e `DD/MM`, desde que receba uma data de
referencia explicita. Ele nao consulta o relogio para interpretar datas
relativas.

## 6. Feature flag e modo sombra

`UNI_OS_ENABLED` esta declarado em `parserAdapter.js` com valor `false`.

Quando falso:

- o parser funciona como antes;
- o orchestrator nao e chamado;
- nenhum log e produzido;
- nenhum objeto adicional influencia o fluxo.

Quando verdadeiro em uma futura validacao local:

1. o resultado do parser e adaptado;
2. `uniOS.process({ parsedIntent })` e chamado;
3. o retorno do UNI OS e descartado;
4. qualquer falha vira `FAILED_SAFE`;
5. o fluxo legado continua com o resultado original.

A flag nao e uma ativacao de produto. Antes de uso fora de desenvolvimento ela
devera migrar para configuracao controlada e observavel.

## 7. Logging DEV

Com flag ativa e `import.meta.env.DEV`, os logs usam o prefixo `[UNI OS]` e
mostram somente:

- intent, source, confidence e necessidade de confirmacao;
- contagens de entidades, sem valores;
- tipo de attention;
- quantidade de passos do planning;
- contagens e flags de reflection.

Texto, descricao, conta, categoria, valor, data, usuario, sessao e workspace nao
sao registrados. Erros do modo sombra nao expõem detalhes internos.

## 8. Origem da entrada

O schema suporta `text`, `voice` e `system`. O fluxo atual transforma a
transcricao final em texto antes de chamar `useUniConversation`, sem transportar
metadado de origem. Para preservar a regra de nao alterar Voice Input ou
componentes React, esta integracao usa `text` como fallback atual.

Uma etapa futura podera transportar a origem por um contrato neutro, sem criar
um parser diferente para voz.

## 9. Garantias

- parser atual sem alteracoes;
- reducers atuais sem alteracoes;
- resposta legada continua sendo a unica resposta usada;
- nenhuma nova confirmacao ou execucao;
- nenhuma memoria criada ou consultada pelo adapter;
- nenhum acesso Supabase;
- nenhuma API externa;
- nenhum efeito visual;
- falha sombra nunca propaga para o usuario.

## 10. Testes

A cobertura valida:

- texto, conta e categoria normalizados;
- valores monetarios;
- datas relativas, curtas e ISO;
- schema e imutabilidade profunda;
- compatibilidade com a saida real do parser;
- colecoes de entidades presentes e futuras;
- action type e confirmacao;
- flag desligada sem chamada ao UNI OS;
- modo sombra com resultado descartado;
- logs DEV sem texto ou valores;
- falha contida.

## 11. Integracao futura

1. transportar `source` sem alterar o parser;
2. substituir a constante por feature flag controlada por ambiente DEV;
3. comparar attention e planning com resultados esperados;
4. adicionar metricas agregadas sem dados financeiros;
5. validar divergencias antes de qualquer uso do resultado;
6. manter o fluxo atual como fonte de verdade durante toda a observacao;
7. somente depois avaliar uma ativacao gradual e reversivel.

## 12. Estado

O adapter esta implementado e conectado em modo sombra, mas a flag permanece
desligada. Nenhum usuario percebe mudanca visual ou funcional.
