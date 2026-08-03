import InspectorDataCard from './InspectorDataCard.jsx';

function InspectorSecurityCard({ data }) {
  return <InspectorDataCard id="security" title="Security" eyebrow="Policy" data={data} highlights={[
    { label: 'Status', value: data.status ?? 'UNKNOWN' },
    { label: 'Blocked', value: data.blocked ?? false },
    { label: 'Warnings', value: data.warnings?.length ?? 0 },
  ]} />;
}

export default InspectorSecurityCard;
