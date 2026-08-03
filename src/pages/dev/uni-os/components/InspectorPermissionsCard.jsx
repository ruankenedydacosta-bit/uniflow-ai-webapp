import InspectorDataCard from './InspectorDataCard.jsx';

function InspectorPermissionsCard({ data }) {
  return <InspectorDataCard id="permissions" title="Permissions" eyebrow="Cognitive access" data={data} highlights={[
    { label: 'Status', value: data.status ?? 'UNKNOWN' },
    { label: 'Scopes', value: data.scopes?.length ?? 0 },
    { label: 'Restrictions', value: data.restrictions?.length ?? 0 },
  ]} />;
}

export default InspectorPermissionsCard;
