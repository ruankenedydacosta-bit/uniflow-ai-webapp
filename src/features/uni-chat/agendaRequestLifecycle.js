export function isAgendaRequestContextCurrent(request, current, currentTurnToken) {
  return Boolean(
    request
    && current
    && currentTurnToken === request.turnToken
    && current.conversationId === request.conversationId
    && current.userId === request.userId
    && current.workspaceId === request.workspaceId
    && current.mode === request.mode,
  );
}

export function invalidateAgendaRequestContext(
  { turnTokenRef, activeIdRef, contextRef },
  changes = {},
) {
  turnTokenRef.current += 1;
  contextRef.current = { ...contextRef.current, ...changes };

  if (activeIdRef && Object.hasOwn(changes, 'conversationId')) {
    activeIdRef.current = changes.conversationId;
  }

  return turnTokenRef.current;
}
