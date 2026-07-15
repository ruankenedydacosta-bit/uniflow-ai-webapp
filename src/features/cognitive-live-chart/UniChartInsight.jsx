import styles from './CognitiveLiveChart.module.css';

/**
 * Cartão de interpretação da Uni, exibido nos modos uni-insight, comparison
 * e forecast. É a "voz da Uni" — nunca compete visualmente com o gráfico,
 * mas se conecta a ele por uma linha discreta (desenhada pelo componente
 * pai, que conhece as coordenadas do ponto/intervalo destacado).
 */
export default function UniChartInsight({
  message,
  detail,
  variant,
  onListenAnalysis,
  onViewDetails,
}) {
  return (
    <div className={styles.uniInsightCard} role="note" aria-label="Interpretação da Uni">
      <div className={styles.uniInsightHeader}>
        <span className={styles.uniSparkle} aria-hidden="true">
          &#10022;
        </span>
        <span className={styles.uniInsightEyebrow}>Uni</span>
      </div>
      <p className={styles.uniInsightMessage}>{message}</p>
      {variant === 'detailed' && detail ? (
        <p className={styles.uniInsightDetail}>{detail}</p>
      ) : null}
      {variant === 'detailed' ? (
        <div className={styles.uniInsightActions}>
          <button
            type="button"
            className={styles.uniInsightButtonPrimary}
            onClick={onListenAnalysis}
          >
            Ouvir a análise da Uni
          </button>
          <button
            type="button"
            className={styles.uniInsightButtonSecondary}
            onClick={onViewDetails}
          >
            Ver detalhes
          </button>
        </div>
      ) : null}
    </div>
  );
}
