import InspectorDataCard from './InspectorDataCard.jsx';

function InspectorMemoryCard({ data }) {
  const providers = data.metadata?.providers ?? [];
  const accounts = data.financial?.accounts ?? [];
  const goals = data.financial?.goals ?? [];

  return <InspectorDataCard id="memory" title="Memory" eyebrow="Read only" data={data} highlights={[
    { label: 'Providers', value: Array.isArray(providers) ? providers.length : providers },
    { label: 'Accounts', value: Array.isArray(accounts) ? accounts.length : accounts },
    { label: 'Goals', value: Array.isArray(goals) ? goals.length : goals },
  ]} />;
}

export default InspectorMemoryCard;
