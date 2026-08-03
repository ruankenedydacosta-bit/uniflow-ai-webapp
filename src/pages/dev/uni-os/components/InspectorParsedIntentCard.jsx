import InspectorDataCard from './InspectorDataCard.jsx';

function InspectorParsedIntentCard({ data }) {
  return <InspectorDataCard id="parsed-intent" title="Parsed Intent" eyebrow="Input" data={data} highlights={[
    { label: 'Intent', value: data.intent ?? 'Not provided' },
    { label: 'Confidence', value: `${Math.round((data.confidence ?? 0) * 100)}%` },
    { label: 'Source', value: data.source ?? 'Shadow input' },
  ]} />;
}

export default InspectorParsedIntentCard;
