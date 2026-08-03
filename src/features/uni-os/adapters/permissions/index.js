export {
  adaptPermissionsInput,
  logPermissionsSummary,
  runPermissionsAdapterShadow,
} from './permissionsAdapter.js';
export { evaluateCognitivePermissions } from './permissionsEngine.js';
export {
  COGNITIVE_SCOPES,
  PERMISSION_REASONS,
  PERMISSION_RESTRICTIONS,
  PERMISSIONS_STATUSES,
  resolveCognitiveScopes,
  resolvePermissionStatus,
} from './permissionsPolicy.js';
export {
  createPermissionsSnapshot,
  UNI_OS_PERMISSIONS_SCHEMA_VERSION,
} from './permissionsSchema.js';
