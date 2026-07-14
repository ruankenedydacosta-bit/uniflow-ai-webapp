import InsightChip from './InsightChip.jsx';

function InsightCarousel({ insights = [], onSelect }) {
  if (!insights.length) return null;

  return (
    <section className="homeMobileInsights" aria-labelledby="home-mobile-insights-title">
      <h2 id="home-mobile-insights-title">Insights</h2>
      <div className="homeMobileInsightTrack" role="list">
        {insights.map((insight) => (
          <div role="listitem" key={insight.id ?? insight.label}>
            <InsightChip insight={insight} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default InsightCarousel;
