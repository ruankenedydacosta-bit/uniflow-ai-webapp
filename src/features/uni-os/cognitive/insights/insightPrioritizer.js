const PRIORITY_WEIGHT = Object.freeze({ LOW: 1, NORMAL: 2, HIGH: 3, CRITICAL: 4 });

export function prioritizeInsights(insights = []) {
  if (!Array.isArray(insights)) return [];
  return insights
    .map((insight, index) => ({ insight, index }))
    .sort((first, second) => (
      second.insight.score - first.insight.score
      || PRIORITY_WEIGHT[second.insight.priority] - PRIORITY_WEIGHT[first.insight.priority]
      || second.insight.confidence - first.insight.confidence
      || first.index - second.index
    ))
    .map(({ insight }) => insight);
}

export { PRIORITY_WEIGHT as INSIGHT_PRIORITY_WEIGHT };
