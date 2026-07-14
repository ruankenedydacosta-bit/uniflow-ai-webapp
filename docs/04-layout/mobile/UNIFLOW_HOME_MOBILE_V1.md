# UniFlow Home Mobile V1

## Decisão

A Home mobile é um briefing executivo diário, não uma redução do dashboard
desktop. Sua leitura segue uma ordem fixa: interpretação da Uni, ação única,
confirmação financeira, progresso, descobertas relevantes e atalhos.

## Composição

1. `UniBriefingCard`: interpretação principal e único bloco com destaque de IA;
2. `NextStepCard`: uma única ação priorizada;
3. `FinancialSummaryStrip`: quatro métricas compactas;
4. `GoalsProgressList`: metas com progresso acessível;
5. `InsightCarousel`: descobertas relevantes em rolagem horizontal;
6. `QuickActionsGrid`: ações recorrentes sem lógica de domínio.

`HomeSectionSkeleton` preserva a altura e a ordem no carregamento.
`HomeEmptyState` fornece estados vazios acionáveis. Insights sem conteúdo não
renderizam seção. Métricas sem dado usam `sem dados ainda`, distinguindo ausência
de um valor financeiro real igual a zero.

## Integração

`DashboardPage` mantém o conteúdo desktop original e acrescenta
`MobileHomeView`, visível somente abaixo de 768px. `MobileAppShell`,
`MobileContextHeader`, Bottom Navigation, `AuthenticatedLayout`, rotas, guards e
autenticação permanecem intocados.

Os dados da V1 são mocks profundamente imutáveis. As ações expõem callbacks de
navegação, sem IA, Supabase ou geração real de briefing e insights.

## Responsividade

- 320px: resumo em 2x2 e briefing com tipografia compacta;
- 375px e 390px: resumo em quatro colunas e atalhos em 2x2;
- 430px: atalhos em quatro colunas quando há espaço;
- ordem das seções invariável em todas as larguras.

Áreas acionáveis respeitam 44px. Animações possuem fallback por
`prefers-reduced-motion`.

## Limitações

- briefing, próximo passo, resumo, objetivos e insights ainda são estáticos;
- atalhos navegam para telas existentes sem iniciar formulários específicos;
- animação de progresso ocorre na montagem, sem observador de viewport;
- integração cognitiva e dados reais ficam para etapas futuras.
