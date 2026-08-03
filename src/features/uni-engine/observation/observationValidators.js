// Uni Engine — Observação da conversa (Parte 2, Bloco 3).
//
// Validadores da camada observacional. Separam (a) a validação das ENTRADAS
// (os sub-snapshots da integração, guidance e activation precisam ser objetos
// serializáveis e sem funções antes de serem embedados) e (b) a validação do
// SNAPSHOT CONSOLIDADO final — a forma fechada que o build deve entregar.
import {
  isSerializableValue,
  findFunctionsInValue,
} from '../uniEngineContracts.js';
import {
  OBSERVATION_VERSION,
  isObservationMode,
} from './observationContracts.js';

export function isObservationSnapshotObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasNoFunctions(value) {
  return findFunctionsInValue(value).length === 0;
}

// Um sub-snapshot é embedável quando é um objeto serializável, sem funções
// e sem referências circulares. O build ainda redige/sanitiza tudo — esta
// checagem apenas garante que o dado de origem não está corrompido.
export function isSafeEmbeddableSnapshot(value) {
  if (!isObservationSnapshotObject(value)) return false;
  return isSerializableValue(value) && hasNoFunctions(value);
}

export function validateObservationInput(input = {}) {
  const safe = isObservationSnapshotObject(input) ? input : {};
  const errors = [];

  if (safe.integrationSnapshot != null) {
    if (!isObservationSnapshotObject(safe.integrationSnapshot)) {
      errors.push('INTEGRATION_SNAPSHOT_INVALID');
    } else if (!isSafeEmbeddableSnapshot(safe.integrationSnapshot)) {
      errors.push('INTEGRATION_SNAPSHOT_UNSAFE');
    }
  }

  if (safe.guidanceSnapshot != null) {
    if (!isObservationSnapshotObject(safe.guidanceSnapshot)) {
      errors.push('GUIDANCE_SNAPSHOT_INVALID');
    } else if (!isSafeEmbeddableSnapshot(safe.guidanceSnapshot)) {
      errors.push('GUIDANCE_SNAPSHOT_UNSAFE');
    }
  }

  if (safe.activationSnapshot != null) {
    const isActivationShape = Array.isArray(safe.activationSnapshot)
      || isObservationSnapshotObject(safe.activationSnapshot);
    if (!isActivationShape) {
      errors.push('ACTIVATION_SNAPSHOT_INVALID');
    } else if (!isSafeEmbeddableSnapshot(safe.activationSnapshot)) {
      errors.push('ACTIVATION_SNAPSHOT_UNSAFE');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateObservationSnapshot(snapshot) {
  if (!isObservationSnapshotObject(snapshot)) {
    return { valid: false, errors: ['SNAPSHOT_NOT_OBJECT'] };
  }
  const errors = [];
  if (snapshot.version !== OBSERVATION_VERSION) {
    errors.push('VERSION_INVALID');
  }
  if (!isObservationMode(snapshot.mode) || snapshot.mode !== 'observational') {
    errors.push('MODE_NOT_OBSERVATIONAL');
  }
  if (snapshot.legacyPreserved !== true) {
    errors.push('LEGACY_PRESERVED_FALSE');
  }
  if (typeof snapshot.shadowMode !== 'boolean') {
    errors.push('SHADOW_MODE_INVALID');
  }
  if (!Array.isArray(snapshot.capabilities)) {
    errors.push('CAPABILITIES_NOT_ARRAY');
  }
  if (!Array.isArray(snapshot.diagnostics)) {
    errors.push('DIAGNOSTICS_NOT_ARRAY');
  }
  if (!isObservationSnapshotObject(snapshot.timestamps)) {
    errors.push('TIMESTAMPS_INVALID');
  }
  if (!isObservationSnapshotObject(snapshot.metadata)) {
    errors.push('METADATA_INVALID');
  }
  if (snapshot.integrationSnapshot !== null && !isObservationSnapshotObject(snapshot.integrationSnapshot)) {
    errors.push('INTEGRATION_SNAPSHOT_INVALID');
  }
  if (snapshot.guidanceSnapshot !== null && !isObservationSnapshotObject(snapshot.guidanceSnapshot)) {
    errors.push('GUIDANCE_SNAPSHOT_INVALID');
  }
  if (snapshot.activationSnapshot !== null && !isObservationSnapshotObject(snapshot.activationSnapshot)) {
    errors.push('ACTIVATION_SNAPSHOT_INVALID');
  }
  if (snapshot.serializable !== true) {
    errors.push('SERIALIZABLE_FALSE');
  }
  if (!isSerializableValue(snapshot) || !hasNoFunctions(snapshot)) {
    errors.push('SNAPSHOT_NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}
