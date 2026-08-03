import { inspectorPipelineStages, inspectorRuntimeMock } from '../mocks/inspectorRuntime.mock.js';

export function formatInspectorTime(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return '--:--:--';

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export function useMockInspectorRuntime() {
  return {
    runtime: inspectorRuntimeMock,
    stages: inspectorPipelineStages,
    displayTime: formatInspectorTime(inspectorRuntimeMock.timestamp),
  };
}
