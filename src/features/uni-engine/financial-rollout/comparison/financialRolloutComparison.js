// Uni Engine — Fase 19: Rollout Control — comparação agregada control × canary.

export function buildFinancialRolloutComparison(options = {}) {
  const { controlEntries = [], canaryEntries = [], identity = null } = options;

  const metrics = {
    control: {
      total: controlEntries.length,
      selectedRuntime: countSelectedSource(controlEntries, 'financial_runtime'),
      selectedLegacy: countSelectedSource(controlEntries, 'legacy'),
      averageConfidence: averageByKey(controlEntries, 'confidence'),
      averageExecutionTime: averageByKey(controlEntries, 'executionTimeMs'),
    },
    canary: {
      total: canaryEntries.length,
      selectedRuntime: countSelectedSource(canaryEntries, 'financial_runtime'),
      selectedLegacy: countSelectedSource(canaryEntries, 'legacy'),
      averageConfidence: averageByKey(canaryEntries, 'confidence'),
      averageExecutionTime: averageByKey(canaryEntries, 'executionTimeMs'),
    },
    divergenceCount: 0,
    agreementPercentage: 0,
    blockedReasons: {},
    totalEntries: controlEntries.length + canaryEntries.length,
    timestamp: Date.now(),
  };

  metrics.divergenceCount = metrics.control.selectedRuntime + metrics.canary.selectedRuntime;
  const totalSelected = metrics.control.selectedLegacy + metrics.canary.selectedLegacy;
  const totalDecided = metrics.divergenceCount + totalSelected;
  metrics.agreementPercentage = totalDecided > 0 ? (totalSelected / totalDecided) * 100 : 0;

  const allEntries = [...controlEntries, ...canaryEntries];
  for (const entry of allEntries) {
    if (entry?.reasonCodes && Array.isArray(entry.reasonCodes)) {
      for (const code of entry.reasonCodes) {
        metrics.blockedReasons[code] = (metrics.blockedReasons[code] || 0) + 1;
      }
    }
  }

  return metrics;
}

function countSelectedSource(entries, source) {
  return entries.filter(entry => entry?.selectedSource === source).length;
}

function averageByKey(entries, key) {
  if (!entries || entries.length === 0) return 0;
  const validValues = entries
    .map(entry => entry?.[key])
    .filter(value => typeof value === 'number' && Number.isFinite(value));
  if (validValues.length === 0) return 0;
  return validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
}

export function validateFinancialRolloutComparison(comparison) {
  if (!comparison || typeof comparison !== 'object') {
    return { valid: false, errors: ['COMPARISON_INVALID'] };
  }
  const errors = [];
  if (typeof comparison.timestamp !== 'number' || !Number.isFinite(comparison.timestamp)) {
    errors.push('TIMESTAMP_INVALID');
  }
  if (typeof comparison.totalEntries !== 'number' || !Number.isFinite(comparison.totalEntries)) {
    errors.push('TOTAL_ENTRIES_INVALID');
  }
  if (!comparison.control || typeof comparison.control !== 'object') {
    errors.push('CONTROL_METRICS_INVALID');
  } else {
    validateMetrics(comparison.control, 'control', errors);
  }
  if (!comparison.canary || typeof comparison.canary !== 'object') {
    errors.push('CANARY_METRICS_INVALID');
  } else {
    validateMetrics(comparison.canary, 'canary', errors);
  }
  if (typeof comparison.divergenceCount !== 'number' || !Number.isFinite(comparison.divergenceCount)) {
    errors.push('DIVERGENCE_COUNT_INVALID');
  }
  if (typeof comparison.agreementPercentage !== 'number' || !Number.isFinite(comparison.agreementPercentage)) {
    errors.push('AGREEMENT_PERCENTAGE_INVALID');
  }
  if (comparison.agreementPercentage < 0 || comparison.agreementPercentage > 100) {
    errors.push('AGREEMENT_PERCENTAGE_OUT_OF_RANGE');
  }
  if (!comparison.blockedReasons || typeof comparison.blockedReasons !== 'object') {
    errors.push('BLOCKED_REASONS_INVALID');
  } else {
    for (const [code, count] of Object.entries(comparison.blockedReasons)) {
      if (typeof code !== 'string' || typeof count !== 'number' || !Number.isFinite(count)) {
        errors.push('BLOCKED_REASON_INVALID');
        break;
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function validateMetrics(metrics, label, errors) {
  if (typeof metrics.total !== 'number' || !Number.isFinite(metrics.total)) {
    errors.push(`${label}_TOTAL_INVALID`);
  }
  if (typeof metrics.selectedRuntime !== 'number' || !Number.isFinite(metrics.selectedRuntime)) {
    errors.push(`${label}_SELECTED_RUNTIME_INVALID`);
  }
  if (typeof metrics.selectedLegacy !== 'number' || !Number.isFinite(metrics.selectedLegacy)) {
    errors.push(`${label}_SELECTED_LEGACY_INVALID`);
  }
  if (typeof metrics.averageConfidence !== 'number' || !Number.isFinite(metrics.averageConfidence)) {
    errors.push(`${label}_AVERAGE_CONFIDENCE_INVALID`);
  }
  if (metrics.averageConfidence < 0 || metrics.averageConfidence > 1) {
    errors.push(`${label}_AVERAGE_CONFIDENCE_OUT_OF_RANGE`);
  }
  if (typeof metrics.averageExecutionTime !== 'number' || !Number.isFinite(metrics.averageExecutionTime)) {
    errors.push(`${label}_AVERAGE_EXECUTION_TIME_INVALID`);
  }
}
