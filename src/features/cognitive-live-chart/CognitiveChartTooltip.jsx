import styles from './CognitiveLiveChart.module.css';
import { formatBRL } from './cognitiveLiveChart.utils';

/**
 * Tooltip flutuante exibido ao tocar/arrastar sobre o gráfico.
 * Sempre reposicionado nos eixos horizontal e vertical para permanecer
 * dentro da área visível do gráfico.
 */
export default function CognitiveChartTooltip({
  x, y, point, seriesLabels = { receita: 'Entradas', despesa: 'Saídas' }, containerWidth, containerHeight,
}) {
  if (!point) return null;

  const saldo = point.receita - point.despesa;
  const tooltipWidth = 168;
  const tooltipHeight = 124;
  const half = tooltipWidth / 2;
  const clampedX = Math.min(Math.max(x, half + 8), containerWidth - half - 8);
  const preferredTop = y < tooltipHeight + 8 ? y + 14 : y - tooltipHeight - 14;
  const clampedTop = Math.min(
    Math.max(preferredTop, 8),
    Math.max(8, containerHeight - tooltipHeight - 8),
  );

  return (
    <div
      className={styles.tooltip}
      style={{
        left: clampedX,
        top: clampedTop,
        transform: 'translateX(-50%)',
        width: tooltipWidth,
      }}
      role="status"
      aria-live="polite"
    >
      <p className={styles.tooltipDate}>{point.label}</p>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipDotReceita} aria-hidden="true" />
        <span className={styles.tooltipLabel}>{seriesLabels.receita}</span>
        <span className={styles.tooltipValueReceita}>{formatBRL(point.receita)}</span>
      </div>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipDotDespesa} aria-hidden="true" />
        <span className={styles.tooltipLabel}>{seriesLabels.despesa}</span>
        <span className={styles.tooltipValueDespesa}>{formatBRL(point.despesa)}</span>
      </div>
      <div className={styles.tooltipDivider} />
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipLabel}>Saldo do dia</span>
        <span className={styles.tooltipValueSaldo}>{formatBRL(saldo)}</span>
      </div>
    </div>
  );
}
