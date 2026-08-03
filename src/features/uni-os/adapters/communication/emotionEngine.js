export const COMMUNICATION_EMOTIONS = Object.freeze([
  'CALM',
  'OBJECTIVE',
  'EDUCATIONAL',
  'EMPATHETIC',
  'ENCOURAGING',
  'CELEBRATING',
  'CAREFUL',
  'URGENT',
  'FOCUSED',
  'SUPPORTIVE',
]);

export function resolveCommunicationEmotion({ structuredResponse = {}, contextSnapshot = {} } = {}) {
  const intent = structuredResponse?.facts?.parsedIntent ?? {};
  const security = structuredResponse?.security ?? {};
  const reflection = structuredResponse?.reflection ?? {};
  const situation = contextSnapshot?.situation ?? contextSnapshot?.conversation?.situation;
  const attentionType = intent.attentionType;

  if (attentionType === 'emergency' || intent.emergency === true) return 'URGENT';
  if (security.status === 'BLOCK' || security.risk === 'HIGH'
      || reflection.overallRisk === 'HIGH') return 'CAREFUL';
  if (situation === 'celebration') return 'CELEBRATING';
  if (situation === 'uncertainty') return 'EMPATHETIC';
  if (situation === 'progress') return 'ENCOURAGING';
  if (situation === 'support') return 'SUPPORTIVE';
  if (attentionType === 'explanation' || intent.intent === 'explanation') return 'EDUCATIONAL';
  if (attentionType === 'planning' || intent.intent === 'planning') return 'FOCUSED';
  if (['financial_action', 'financial_question'].includes(attentionType)) return 'OBJECTIVE';
  return 'CALM';
}
