# UNI OS Memory Ranking Engine V1

## Objetivo

O Memory Ranking Engine seleciona quais memórias válidas são relevantes para a conversa atual. Ele recebe snapshots prontos, calcula relevância conversacional por regras determinísticas e retorna somente referências mínimas. Não cria, altera, remove ou persiste memórias.

## Arquitetura

O módulo isolado vive em `src/features/uni-os/cognitive/memory-ranking`.

- `memoryRankingPolicy.js`: normaliza candidatos, valida elegibilidade, calcula score e ordena.
- `memoryRankingSchema.js`: valida, clona e congela o contrato de saída.
- `memoryRankingEngine.js`: extrai candidatos e coordena o modo sombra.
- `index.js`: API pública local.

Não há integração com runtime, Inspector, Goal Engine, Goal Ranking, providers, Supabase ou interfaces.

## Entradas

- `parsedIntent`: intenção e entidades estruturadas;
- `contextSnapshot`: workspace atual somente leitura;
- `memorySnapshot`: projeção segura ou coleção controlada de memórias;
- `goalSnapshot`: objetivos ativos existentes;
- `goalRankingSnapshot`: relevância conversacional dos objetivos.

## Elegibilidade

Antes do score, uma memória precisa:

- possuir ID e tipo oficial;
- estar em `candidate` ou `confirmed`;
- possuir datas válidas, quando presentes;
- não estar expirada;
- pertencer ao workspace de `contextSnapshot`.

Itens da projeção versionada do Memory Adapter podem omitir o workspace individual porque o isolamento já ocorreu antes da criação do snapshot. Coleções brutas sem workspace são rejeitadas. Memórias inválidas, inativas, expiradas ou de outro workspace nunca entram no ranking.

## Schema

```js
{
  rankedMemories: [{
    memoryId,
    type,
    relevance,
    score,
    confidence,
    reasons,
  }],
  primaryMemory,
  metadata,
}
```

A saída é profundamente imutável. `primaryMemory` é o primeiro item ou `null`.

## Score

O score V1 é limitado de `0` a `100`:

- workspace compatível: 8 pontos;
- intenção compatível: 30 pontos;
- categoria compatível: 22 pontos;
- objetivo ativo relacionado: 18 pontos;
- contexto conversacional compatível: 12 pontos;
- recência: 4, 8 ou 12 pontos;
- confiança: até 10 pontos;
- origem explícita ou correção do usuário: 12 pontos.

Somente memórias com score mínimo de 20 são selecionadas. As faixas são `LOW` abaixo de 35, `MEDIUM` de 35 a 64 e `HIGH` a partir de 65.

## Ordenação

O ranking ordena por:

1. maior score;
2. maior confiança;
3. observação mais recente;
4. ordem original.

Empates são estáveis e nenhum score existente na memória é lido ou alterado.

## Fluxo

```text
Snapshots somente leitura
  -> extrair referências existentes
  -> normalizar defensivamente
  -> validar status, expiração e workspace
  -> calcular score determinístico
  -> aplicar limiar de relevância
  -> ordenar
  -> clonar e congelar
```

## Modo sombra

`runMemoryRankingShadow()` usa `UNI_OS_ENABLED`, que continua desligada. Quando habilitado explicitamente, entrega o snapshot a um observador e descarta o resultado. O fluxo legado permanece inalterado.

## Garantias

- nenhuma criação, edição, remoção ou persistência;
- nenhuma alteração de confiança ou score original;
- nenhum acesso a providers ou serviços;
- nenhuma IA, API externa ou ação financeira;
- isolamento por workspace antes da pontuação;
- `executionAllowed`, `createdMemories`, `mutatedMemories` e `persisted` sempre falsos.

## Limitações

A V1 usa correspondências estruturadas pequenas e não lê texto original. A projeção sanitizada do Memory Adapter não carrega recência, confiança ou vínculo detalhado de objetivo em todos os itens; nesses casos, somente os sinais disponíveis participam do score. O ranking não é uma fronteira de autorização e depende do isolamento já aplicado pelos providers e adapters oficiais.

## Roadmap

Etapas futuras podem ampliar motivos explicáveis, receber projeções sanitizadas com mais metadados e integrar o ranking ao runtime apenas em modo sombra. Qualquer uso comportamental exige auditoria separada de privacidade, autorização e regressão.
