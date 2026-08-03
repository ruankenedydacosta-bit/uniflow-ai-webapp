export function evaluatePermissions({ requirements = [], grants = [] } = {}) {
  const required = Array.isArray(requirements) ? [...requirements] : [];
  const available = new Set(Array.isArray(grants) ? grants : []);
  const missing = required.filter((permission) => !available.has(permission));
  return Object.freeze({
    status: required.length === 0 ? 'not_evaluated' : missing.length ? 'denied' : 'allowed',
    required: Object.freeze(required),
    missing: Object.freeze(missing),
    integrated: false,
  });
}
