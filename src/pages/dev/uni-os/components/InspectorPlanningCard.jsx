import InspectorDataCard from './InspectorDataCard.jsx';

function InspectorPlanningCard({ data }) {
  return <InspectorDataCard id="planning" title="Planning" eyebrow="Plan" data={data} highlights={[
    { label: 'Steps', value: data.steps?.length ?? 0 },
    { label: 'Confirmation', value: data.requiresConfirmation ?? false },
    { label: 'Execution', value: data.executionAllowed ?? false },
  ]} />;
}

export default InspectorPlanningCard;
