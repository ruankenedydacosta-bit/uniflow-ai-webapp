export function evaluateSecurity({ checks = [] } = {}) {
  const suppliedChecks = Array.isArray(checks) ? checks : [];
  const failedChecks = suppliedChecks.filter((check) => check?.passed === false);
  return Object.freeze({
    status: suppliedChecks.length === 0 ? 'not_evaluated' : failedChecks.length ? 'blocked' : 'passed',
    usesExistingChecksOnly: true,
    failedChecks: Object.freeze(failedChecks.map((check) => check.id ?? 'unnamed_check')),
  });
}
