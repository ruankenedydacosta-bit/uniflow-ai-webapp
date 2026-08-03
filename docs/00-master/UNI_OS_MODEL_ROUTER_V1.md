# UNI OS Model Router V1

## Objetivo

O Model Router combina Capability Registry, Provider Registry e Routing Policies
para produzir uma decisão de roteamento exclusivamente representacional. Ele
organiza candidatos, representa um provider selecionado e lista fallbacks, sem
executar modelos ou chamar integrações.

## Arquitetura

O módulo está em `src/features/uni-os/llm/model-router/`:

- `routingResolver.js`: resolve capability, policy e candidatos elegíveis;
- `routingScorer.js`: calcula score e confiança determinísticos;
- `routingComparator.js`: ordena candidatos com desempates estáveis;
- `routingSchema.js`: contrato, clone e deep freeze;
- `modelRouter.js`: compõe o resultado e o modo sombra;
- `index.js`: API pública;
- `modelRouter.test.js`: garantias unitárias.

## Fluxo

```text
Compiled Context + Requested Capability
                   |
                   v
        Capability Registry lookup
                   |
                   v
       Routing Policies evaluation
                   |
                   v
      Eligible Provider resolution
                   |
                   v
       Deterministic scoring/order
                   |
                   v
 Representational selected + fallbacks
```

## Resolver

O resolver aceita somente registries e catálogo de policies fornecidos ou seus
defaults oficiais. Ele normaliza o ID da capability, valida a existência da
policy e usa a decisão imutável das Routing Policies para obter os candidatos.

Capability inexistente produz `CAPABILITY_NOT_REGISTERED`. Registry ou catálogo
de policies inválido gera `RoutingResolverError` controlado. Nenhum registro é
criado ou alterado.

## Scoring

O score combina somente:

- posição definida pela Routing Policy;
- status catalogal do provider;
- health catalogal do provider.

Providers `OFFLINE` são removidos. Providers `DEGRADED` continuam representáveis,
mas recebem penalidade e confiança reduzida. Empates usam, nesta ordem:

1. posição na policy;
2. prioridade do Provider Registry;
3. ID do provider.

Não existe inferência, telemetria externa ou avaliação por IA.

## Fallback

O primeiro candidato ordenado é representado em `selectedProvider`. Os demais
formam `fallbackProviders`. Essa lista não executa fallback; ela apenas prepara o
contrato para etapas futuras. `policyFallbackEnabled` preserva a decisão da policy.

## Schema

`routingResult` contém:

- capability solicitada e resolvida;
- candidatos com score e sinais técnicos;
- provider selecionado e fallbacks representacionais;
- policy e motivo estruturado da decisão;
- custo e latência relativos do provider representado;
- requisitos de contexto, streaming, visão e voz;
- confiança determinística;
- metadata técnica sem conteúdo do usuário.

O snapshot completo passa por deep clone e deep freeze. A fonte não é congelada.

## Garantias

- provider selecionado é apenas representacional;
- nenhum modelo ou provider é executado;
- nenhuma API, SDK, URL ou endpoint existe;
- nenhuma credencial, autenticação ou token existe;
- nenhum token é consumido;
- registries, policies e contexto permanecem inalterados;
- `UNI_OS_ENABLED` continua `false`;
- o modo sombra descarta o resultado;
- nenhuma decisão da aplicação é afetada.

## Limitações

Scores, custos, latências, status e health são exclusivamente catalogais. A V1
não mede qualidade real, disponibilidade, custo monetário ou desempenho externo.
O router não está conectado ao Runtime, Gateway ou fluxo legado.

## Roadmap

1. Criar o LLM Adapter Mock para consumir a decisão sem chamadas externas.
2. Validar contratos de request e response simulados.
3. Manter execução desligada até existirem segurança, orçamento e observabilidade.
4. Somente depois avaliar adapters reais em backend seguro.

