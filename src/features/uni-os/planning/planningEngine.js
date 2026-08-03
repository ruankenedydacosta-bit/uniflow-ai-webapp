const STEP_TEMPLATES = Object.freeze({
  financial_action: Object.freeze([
    'Validate the structured financial facts.',
    'Identify ambiguities and required confirmation.',
    'Prepare a safe action proposal without executing it.',
  ]),
  financial_question: Object.freeze([
    'Identify the financial facts relevant to the question.',
    'Organize the explanation around impact and uncertainty.',
    'Prepare a clear next-step recommendation.',
  ]),
  emergency: Object.freeze([
    'Identify the immediate financial risk without alarmism.',
    'Prioritize reversible and protective options.',
    'Require the user to decide the next action.',
  ]),
  planning: Object.freeze([
    'Define the desired financial destination.',
    'Map constraints, milestones and assumptions.',
    'Prepare the next reviewable step.',
  ]),
  configuration: Object.freeze([
    'Identify the preference being requested.',
    'Check whether clarification or consent is needed.',
    'Prepare the proposed configuration change without applying it.',
  ]),
  explanation: Object.freeze([
    'Identify the concept that needs clarification.',
    'Organize a concise and educational explanation.',
    'Offer a practical example without changing facts.',
  ]),
  casual: Object.freeze([
    'Recognize the conversational context.',
    'Prepare a brief response consistent with the Uni identity.',
  ]),
});

export function createPlan({ attention, intent } = {}) {
  const type = attention?.type ?? 'explanation';
  const steps = STEP_TEMPLATES[type] ?? STEP_TEMPLATES.explanation;
  return Object.freeze({
    intent: intent ?? null,
    attentionType: type,
    steps: Object.freeze([...steps]),
    requiresConfirmation: type === 'financial_action' || type === 'configuration',
    executesAction: false,
  });
}
