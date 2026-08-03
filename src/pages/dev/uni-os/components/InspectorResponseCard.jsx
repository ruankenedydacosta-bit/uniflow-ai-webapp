import InspectorDataCard from './InspectorDataCard.jsx';

function InspectorResponseCard({ data }) {
  const sectionCount = Array.isArray(data.sections)
    ? data.sections.length
    : ['facts', 'planning', 'reflection', 'security', 'permissions', 'cognition']
      .filter((section) => data[section]).length;

  return <InspectorDataCard id="response" title="Structured Response" eyebrow="Consolidation" data={data} highlights={[
    { label: 'Sections', value: sectionCount },
    { label: 'Schema', value: data.metadata?.schemaVersion ?? data.version ?? '1.0' },
    { label: 'Shadow', value: data.metadata?.generatedInShadowMode ?? true },
  ]} />;
}

export default InspectorResponseCard;
