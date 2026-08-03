import InspectorDataCard from './InspectorDataCard.jsx';

function InspectorContextCard({ data }) {
  return <InspectorDataCard id="context" title="Context" eyebrow="Snapshot" data={data} highlights={[
    { label: 'Session', value: data.session?.authenticated ? 'Authenticated' : 'Anonymous' },
    { label: 'Workspace', value: data.workspace?.role ?? 'Not provided' },
    { label: 'Channel', value: data.conversation?.channel ?? 'text' },
  ]} />;
}

export default InspectorContextCard;
