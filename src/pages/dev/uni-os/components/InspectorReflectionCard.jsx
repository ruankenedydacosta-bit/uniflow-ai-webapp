import InspectorDataCard from './InspectorDataCard.jsx';

function InspectorReflectionCard({ data }) {
  return <InspectorDataCard id="reflection" title="Reflection" eyebrow="Validation" data={data} highlights={[
    { label: 'Risk', value: data.overallRisk ?? 'UNKNOWN' },
    { label: 'Confidence', value: `${Math.round((data.confidence ?? 0) * 100)}%` },
    { label: 'Ambiguity', value: data.ambiguityDetected ?? false },
  ]} />;
}

export default InspectorReflectionCard;
