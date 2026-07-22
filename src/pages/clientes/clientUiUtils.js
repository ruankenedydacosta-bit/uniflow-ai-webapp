// Mapeamento puro entre o schema real de `clients` (banco) e o vocabulario
// exibido na UI (PT-BR + variantes de Badge). Sem chamada a Supabase, sem
// estado -- testavel isoladamente via node --test.

const LIFECYCLE_STAGE_LABELS = Object.freeze({
  lead: 'Lead',
  potential: 'Potencial',
  active: 'Ativo',
  at_risk: 'Em risco',
  inactive: 'Inativo',
});

const LIFECYCLE_STAGE_VARIANTS = Object.freeze({
  lead: 'secondary',
  potential: 'primary',
  active: 'success',
  at_risk: 'warning',
  inactive: 'outline',
});

export function getLifecycleStageLabel(lifecycleStage) {
  return LIFECYCLE_STAGE_LABELS[lifecycleStage] ?? lifecycleStage ?? 'Sem estagio';
}

export function getLifecycleStageVariant(lifecycleStage) {
  return LIFECYCLE_STAGE_VARIANTS[lifecycleStage] ?? 'outline';
}
