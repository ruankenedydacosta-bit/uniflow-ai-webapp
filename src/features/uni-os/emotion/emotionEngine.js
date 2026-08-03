export const EMOTION_TONES = Object.freeze([
  'calm', 'objective', 'educational', 'celebration', 'empathy', 'alert',
]);

export function resolveEmotionTone({ attention, context = {} } = {}) {
  let tone = 'calm';
  if (context.situation === 'celebration') tone = 'celebration';
  else if (attention?.type === 'emergency') tone = 'alert';
  else if (context.situation === 'uncertainty') tone = 'empathy';
  else if (attention?.type === 'explanation') tone = 'educational';
  else if (['financial_action', 'financial_question', 'planning'].includes(attention?.type)) tone = 'objective';

  return Object.freeze({
    tone,
    changesFacts: false,
    source: 'context_only',
  });
}
