import InspectorDataCard from './InspectorDataCard.jsx';

function InspectorCommunicationCard({ data }) {
  return <InspectorDataCard id="communication" title="Communication" eyebrow="Delivery" data={data} highlights={[
    { label: 'Emotion', value: data.emotion ?? 'CALM' },
    { label: 'Personality', value: data.personality ?? 'DIDACTIC' },
    { label: 'Verbosity', value: data.verbosity ?? 'BALANCED' },
  ]} />;
}

export default InspectorCommunicationCard;
