// Uni Engine — Fase 19: Rollout Control — atribuição determinística de canary.
//
// Usa um hash de string puro em JS (sem depender do módulo 'crypto' do
// Node) porque este arquivo é importado pelo bundle do navegador via
// uni-engine/index.js -> UniChatPage.jsx (Vite/rolldown não resolve
// módulos nativos do Node no cliente). Não é usado para nenhum fim
// criptográfico -- só precisa ser determinístico e razoavelmente bem
// distribuído para bucketing 0-99, o que um hash simples de 32 bits atende.
function deterministicHash32(input) {
  let hash = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV-1a prime
  }
  return hash >>> 0;
}

export function assignFinancialRolloutBucket(identity, config) {
  const safeIdentity = identity && typeof identity === 'object' ? identity : null;
  const safeConfig = config && typeof config === 'object' ? config : {};

  const canaryEnabled = safeConfig.canaryEnabled === true;
  const canaryPercentage = Number.isFinite(safeConfig.canaryPercentage) ? Math.max(0, Math.min(100, safeConfig.canaryPercentage)) : 0;

  if (!canaryEnabled || canaryPercentage <= 0) {
    return {
      eligible: false,
      bucket: 0,
      cohort: 'control',
      deterministic: true,
      reasonCodes: ['CANARY_DISABLED_OR_EMPTY'],
    };
  }

  if (!safeIdentity) {
    return {
      eligible: false,
      bucket: 0,
      cohort: 'control',
      deterministic: true,
      reasonCodes: ['IDENTITY_MISSING'],
    };
  }

  const stableId = extractStableIdentifier(safeIdentity);
  const hashInt = deterministicHash32(stableId);
  const bucket = Math.floor((hashInt % 10000) / 100);

  const eligible = bucket < canaryPercentage;

  return {
    eligible,
    bucket,
    cohort: eligible ? 'canary' : 'control',
    deterministic: true,
    reasonCodes: [],
  };
}

function extractStableIdentifier(identity) {
  if (!identity) return 'null';
  const idFields = [
    identity.userId,
    identity.profileId,
    identity.workspaceId,
    identity.turnId,
    identity.messageId,
  ];
  const nonNullId = idFields.find(id => typeof id === 'string' && id.length > 0) || 'unknown';
  return nonNullId;
}

export function validateFinancialRolloutAssignment(assignment) {
  if (!assignment || typeof assignment !== 'object') {
    return { valid: false, errors: ['ASSIGNMENT_INVALID'] };
  }
  const errors = [];
  if (typeof assignment.eligible !== 'boolean') errors.push('ELIGIBLE_MISSING_OR_NOT_BOOLEAN');
  if (typeof assignment.bucket !== 'number' || !Number.isFinite(assignment.bucket)) {
    errors.push('BUCKET_MISSING_OR_INVALID');
  }
  if (assignment.bucket < 0 || assignment.bucket > 99) {
    errors.push('BUCKET_OUT_OF_RANGE');
  }
  if (!['control', 'canary'].includes(assignment.cohort)) errors.push('COHORT_INVALID');
  if (typeof assignment.deterministic !== 'boolean') errors.push('DETERMINISTIC_MISSING_OR_NOT_BOOLEAN');
  if (!Array.isArray(assignment.reasonCodes)) errors.push('REASON_CODES_INVALID');
  else {
    for (const code of assignment.reasonCodes) {
      if (typeof code !== 'string') {
        errors.push('REASON_CODE_ELEMENT_INVALID');
        break;
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
