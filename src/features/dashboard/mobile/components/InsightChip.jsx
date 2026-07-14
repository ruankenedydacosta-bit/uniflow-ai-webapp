function InsightChip({ insight, onSelect }) {
  return (
    <button
      type="button"
      className="homeMobileInsightChip"
      data-tone={insight.tone ?? 'neutral'}
      onClick={() => onSelect?.(insight)}
    >
      <span className="homeMobileInsightIcon" aria-hidden="true">{insight.icon}</span>
      <span>{insight.label}</span>
    </button>
  );
}

export default InsightChip;
