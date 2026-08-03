# UniFlow Open Finance Animation V1

## Objetivo

Apresentar na Home Mobile, de forma educativa e transparente, como uma futura
conexão Open Finance poderá organizar informações financeiras. A V1 é apenas
uma demonstração visual: não existe conexão bancária, OAuth, backend, API ou
coleta de credenciais.

## Ponto de integração

A variante `compact` aparece depois de `FinancialSummaryStrip` e antes de
`GoalsProgressList`. A ordem relevante da Home é:

1. Uni Briefing
2. Próximo Passo
3. Receitas e Despesas
4. Resumo Financeiro
5. Open Finance - Em breve
6. Objetivos
7. Insights
8. Atalhos Rápidos

O Cognitive Live Chart existente permanece intacto.

## Variantes e duração

- `compact`: seis etapas, 13.000 ms, reprodução automática e loop na Home.
- `expanded`: seis etapas, 15.000 ms, preservada como capacidade reutilizável,
  mas não integrada à Home nesta etapa.

A timeline compacta pausa quando sai do viewport. Em movimento reduzido, a
experiência permanece estática e legível.

## Ver mais

`OpenFinanceLearnMorePanel` é uma explicação estática. O painel não renderiza a
animação novamente e oferece:

- semântica de `dialog` e `aria-modal`;
- título e descrição associados;
- fechamento por Escape e pelo botão `Entendi`;
- ciclo de foco dentro do painel;
- restauração do foco ao acionador;
- rolagem interna em telas pequenas.

## Temas

A feature reutiliza os tokens semânticos de `src/styles/theme.css`. A Home
fornece o `effectiveTheme` do Theme System V1:

- `light` representa Claro;
- `dark` representa Escuro;
- `uniflow` representa UniFlow;
- `system` é resolvido pelo `ThemeProvider` para Claro ou Escuro.

Não existe resolvedor de tema paralelo dentro da animação.

## Limites

Instituições, valores, categorias e etapas são dados genéricos e mockados. A V1
não promete disponibilidade, data de lançamento ou suporte a instituições
específicas. Uma conexão real exigirá uma etapa própria de produto, segurança,
consentimento e integração regulada.
