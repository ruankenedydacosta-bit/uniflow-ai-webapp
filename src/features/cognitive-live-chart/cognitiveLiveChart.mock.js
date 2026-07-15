/**
 * Dados mockados do UNIFLOW COGNITIVE LIVE CHART V1.
 * Nenhum dado é real. Serve apenas para demonstrar os quatro modos do
 * componente (overview, uni-insight, comparison, forecast).
 *
 * Narrativa: receitas crescendo de forma consistente ao longo de julho/2026;
 * despesas estáveis nas primeiras duas semanas, com um aumento relevante na
 * terceira semana (dias 13-19), seguido de recuperação/estabilização até o
 * fim do mês. "Hoje" está fixado no dia 16, para reproduzir o marcador
 * vertical visto no módulo Financeiro.
 */

export const TODAY_DAY = 16;

// Valores acumulados (cumulativos) de receitas e despesas ao longo do mês.
// Cada ponto representa "quanto já entrou/saiu até este dia".
export const currentMonthData = [
  { day: 1, label: '01/07', receita: 200, despesa: 150 },
  { day: 4, label: '04/07', receita: 900, despesa: 520 },
  { day: 7, label: '07/07', receita: 1700, despesa: 900 },
  { day: 10, label: '10/07', receita: 2600, despesa: 1300 },
  { day: 13, label: '13/07', receita: 3600, despesa: 1750 },
  { day: 16, label: '16/07', receita: 4600, despesa: 2900 },
];

// Continuação projetada (linha tracejada) do dia de hoje até o fim do mês.
// Mantém a mesma unidade (acumulado) para permitir uma única escala.
export const forecastMonthData = [
  { day: 16, label: '16/07', receita: 4600, despesa: 2900 },
  { day: 19, label: '19/07', receita: 5300, despesa: 3700 },
  { day: 22, label: '22/07', receita: 5900, despesa: 4100 },
  { day: 25, label: '25/07', receita: 6300, despesa: 4400 },
  { day: 28, label: '28/07', receita: 6600, despesa: 4700 },
  { day: 31, label: '31/07', receita: 6800, despesa: 5000 },
];

// Mesmo período do mês anterior (junho/2026), usado apenas no modo comparison.
export const previousMonthData = [
  { day: 1, label: '01/06', receita: 180, despesa: 160 },
  { day: 4, label: '04/06', despesa: 610, receita: 820 },
  { day: 7, label: '07/06', receita: 1550, despesa: 1050 },
  { day: 10, label: '10/06', receita: 2400, despesa: 1520 },
  { day: 13, label: '13/06', receita: 3300, despesa: 2200 },
  { day: 16, label: '16/06', receita: 4150, despesa: 3295 },
];

// Mensagens e metadados de cada modo. Numa integração futura, isso viria da
// Uni (IA) em tempo real; aqui é 100% estático.
export const uniInsightHighlight = {
  startDay: 13,
  endDay: 19,
  message: 'Suas despesas começaram a subir nesta semana.',
  detail: 'Entre os dias 13 e 19, o ritmo de despesas quase dobrou em relação às duas semanas anteriores.',
};

export const comparisonInsight = {
  message: 'Você gastou 12% menos que no mesmo período do mês passado.',
  detail: 'Considerando despesas acumuladas até o dia 16 de cada mês.',
  deltaPercent: -12,
  currentValue: 2900,
  previousValue: 3295,
};

export const forecastInsight = {
  message: 'Mantendo este ritmo, você deve encerrar o mês com R$ 1.800 de sobra.',
  detail: 'Projeção baseada no comportamento dos últimos dias, não em uma promessa garantida.',
  projectedBalance: 1800,
};

export const periodOptions = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
  { value: 'trimestre', label: 'Trimestre' },
];

export const modeOptions = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'uni-insight', label: 'Uni insight' },
  { value: 'comparison', label: 'Comparação' },
  { value: 'forecast', label: 'Previsão' },
];
