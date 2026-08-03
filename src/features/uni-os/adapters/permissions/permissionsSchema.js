import {
  COGNITIVE_SCOPES,
  PERMISSION_REASONS,
  PERMISSION_RESTRICTIONS,
  PERMISSIONS_STATUSES,
} from './permissionsPolicy.js';

export const UNI_OS_PERMISSIONS_SCHEMA_VERSION = '1.0';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function allowedUnique(values, allowed) {
  return Array.isArray(values)
    ? [...new Set(values.filter((value) => allowed.includes(value)))]
    : [];
}

export function createPermissionsSnapshot(input = {}) {
  const status = PERMISSIONS_STATUSES.includes(input.status) ? input.status : 'UNKNOWN';
  const scopes = allowedUnique(input.scopes, COGNITIVE_SCOPES);
  const grants = allowedUnique(input.grants, COGNITIVE_SCOPES)
    .filter((grant) => scopes.includes(grant));

  return deepFreeze({
    permissionsId: typeof input.permissionsId === 'string' ? input.permissionsId : '',
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : '',
    status,
    scopes,
    grants,
    restrictions: allowedUnique(input.restrictions, PERMISSION_RESTRICTIONS),
    reasons: allowedUnique(input.reasons, PERMISSION_REASONS),
    executionAllowed: false,
    metadata: {
      version: UNI_OS_PERMISSIONS_SCHEMA_VERSION,
    },
  });
}
