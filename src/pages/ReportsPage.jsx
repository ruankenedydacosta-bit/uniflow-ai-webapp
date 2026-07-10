import { useAccess } from '../app/AccessContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { cx } from '../utils/cx';
import { formatCurrency } from '../utils/formatters';
import { reportsMock } from './relatorios/reports.mock.js';
import styles from './ReportsPage.module.css';

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const CHART_PADDING = 28;

function getReportsContext(currentWorkspace) {
  return currentWorkspace === WORKSPACE_TYPES.PERSONAL ? reportsMock.personal : reportsMock.business;
}

function buildChartPoints(points, key, minValue, maxValue) {
  const availableWidth = CHART_WIDTH - CHART_PADDING * 2;
  const availableHeight = CHART_HEIGHT - CHART_PADDING * 2;
  const valueRange = maxValue - minValue || 1;

  return points.map((point, index) => {
    const x = CHART_PADDING + (availableWidth / Math.max(points.length - 1, 1)) * index;
    const y = CHART_HEIGHT - CHART_PADDING - ((point[key] - minValue) / valueRange) * availableHeight;

    return { ...point, x, y };
  });
}

function getLinePath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function EvolutionChart({ chart }) {
  const allValues = chart.points.flatMap((point) => [point.current, point.previous]);
  const minValue = Math.min(...allValues) * 0.96;
  const maxValue = Math.max(...allValues) * 1.04;
  const currentPoints = buildChartPoints(chart.points, 'current', minValue, maxValue);
  const previousPoints = buildChartPoints(chart.points, 'previous', minValue, maxValue);
  const lastPoint = currentPoints[currentPoints.length - 1];

  return (
    <div className={styles.chartBlock}>
      <div className={styles.chartHeader}>
        <div>
          <span>{chart.title}</span>
          <strong>{formatCurrency(lastPoint.current)}</strong>
        </div>
        <Badge variant="glass" size="sm">
          {chart.seriesLabel}
        </Badge>
      </div>

      <svg className={styles.chart} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={chart.title}>
        <defs>
          <linearGradient id="reportsCurrentArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <path
          className={styles.chartArea}
          d={`${getLinePath(currentPoints)} L ${CHART_WIDTH - CHART_PADDING} ${CHART_HEIGHT - CHART_PADDING} L ${CHART_PADDING} ${
            CHART_HEIGHT - CHART_PADDING
          } Z`}
        />
        <path className={styles.previousLine} d={getLinePath(previousPoints)} />
        <path className={styles.currentLine} d={getLinePath(currentPoints)} />

        {chart.points.map((point, index) => (
          <g key={point.label}>
            <circle className={styles.previousPoint} cx={previousPoints[index].x} cy={previousPoints[index].y} r="4" />
            <circle className={styles.currentPoint} cx={currentPoints[index].x} cy={currentPoints[index].y} r="5" />
            <text className={styles.chartLabel} x={currentPoints[index].x} y={CHART_HEIGHT - 6} textAnchor="middle">
              {point.label}
            </text>
          </g>
        ))}
      </svg>

      <div className={styles.chartLegend} aria-label="Legenda do gráfico">
        <span>
          <i className={styles.currentLegend} aria-hidden="true" />
          {chart.currentLabel}
        </span>
        <span>
          <i className={styles.previousLegend} aria-hidden="true" />
          {chart.previousLabel}
        </span>
      </div>
    </div>
  );
}

function ReportsPage() {
  const { access } = useAccess();
  const reports = getReportsContext(access.currentWorkspace);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="relatorios-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {reports.workspaceLabel}
          </Badge>
          <h2 id="relatorios-title">Relatórios</h2>
          <p>{reports.subtitle}</p>
        </div>

        <div className={styles.actions}>
          <Button>Ver evolução</Button>
          <Button variant="secondary">Perguntar à Uni</Button>
        </div>
      </section>

      <section className={styles.focusGrid} aria-label="Evolução financeira">
        <Card variant="glass" padding="lg" className={styles.evolutionCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>{reports.periodLabel}</span>
              <h3>Evolução financeira</h3>
            </div>
            <Badge variant="success" size="sm" dot>
              Em leitura
            </Badge>
          </div>

          <p className={styles.evolutionText}>{reports.evolution}</p>
          <EvolutionChart chart={reports.chart} />
        </Card>

        <Card variant="outline" padding="lg" className={styles.indicatorsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Indicadores compactos</h3>
              <p>Quatro sinais para entender a evolução sem virar planilha.</p>
            </div>
          </div>

          <div className={styles.indicatorList}>
            {reports.indicators.map((indicator) => (
              <div key={indicator.label} className={styles.indicatorItem}>
                <span>{indicator.label}</span>
                <strong>{indicator.value}</strong>
                <Badge variant={indicator.variant} size="sm">
                  {indicator.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className={styles.guidanceGrid} aria-label="Padrões e orientação da Uni">
        <Card variant="default" padding="lg" className={styles.patternsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Padrões percebidos</h3>
              <p>O que a Uni encontrou nos movimentos recentes.</p>
            </div>
          </div>

          <div className={styles.patternList}>
            {reports.patterns.map((pattern, index) => (
              <div key={pattern} className={styles.patternItem}>
                <span className={cx(styles.patternDot, styles[`patternTone${index + 1}`])} aria-hidden="true" />
                <p>{pattern}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className={styles.sideStack}>
          <Card variant="glass" padding="lg" className={styles.uniCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>Leitura da Uni</h3>
                <p>Uma interpretação curta, sem culpa e sem ruído.</p>
              </div>
              <Badge variant="glass" size="sm" dot>
                Uni
              </Badge>
            </div>
            <p>{reports.uniReading}</p>
          </Card>

          <Card variant="outline" padding="lg" className={styles.nextCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h3>Próximo ajuste recomendado</h3>
                <p>Uma decisão simples para o próximo ciclo.</p>
              </div>
            </div>
            <strong>{reports.nextAdjustment}</strong>
          </Card>
        </div>
      </section>
    </div>
  );
}

export default ReportsPage;
