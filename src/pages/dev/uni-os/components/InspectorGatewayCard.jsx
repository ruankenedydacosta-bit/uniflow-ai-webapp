import InspectorDataCard from './InspectorDataCard.jsx';

function InspectorGatewayCard({ data }) {
  return <InspectorDataCard id="gateway" title="Gateway" eyebrow="Cognitive" data={data} highlights={[
    { label: 'Route', value: data.route ?? 'NOT_IMPLEMENTED' },
    { label: 'Capability', value: data.modelCapability ?? 'Not selected' },
    { label: 'Invoke model', value: data.shouldInvokeModel ?? false },
  ]} />;
}

export default InspectorGatewayCard;
