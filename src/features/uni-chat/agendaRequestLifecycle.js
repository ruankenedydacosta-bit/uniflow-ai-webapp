export function isAgendaRequestContextCurrent(request, current, currentTurnToken) {
  return Boolean(
    request
    && current
    && currentTurnToken === request.turnToken
    && current.conversationId === request.conversationId
    && current.userId === request.userId
    && current.workspaceId === request.workspaceId,
  );
}
