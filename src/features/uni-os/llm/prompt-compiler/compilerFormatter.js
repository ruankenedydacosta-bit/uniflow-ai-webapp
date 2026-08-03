import { createCompilerMetadataBlock, createCompilerTemplate } from './compilerTemplates.js';

function serialize(value, indent) {
  if (typeof value === 'string') return value;
  const serialized = JSON.stringify(value, null, indent);
  return serialized === undefined ? '' : serialized;
}

export function formatCompilerSection(section = {}, policy = {}) {
  const template = createCompilerTemplate(section, policy);
  const contentText = serialize(section.content, policy.jsonIndent ?? 2);
  const compilerMetadata = createCompilerMetadataBlock(section, policy);
  const metadataText = compilerMetadata
    ? `\n${serialize({ compilerMetadata }, policy.jsonIndent ?? 2)}`
    : '';
  return {
    id: section.id,
    title: template.title,
    separator: template.separator,
    content: section.content,
    formattedText: `${template.title}\n${template.separator}\n${contentText}${metadataText}`,
    estimatedTokens: section.estimatedTokens,
    metadata: {
      sourcePriority: section.priority,
      sourceMetadata: section.metadata,
      compilerMetadataIncluded: compilerMetadata !== null,
      sectionGap: template.sectionGap,
    },
  };
}

export function assembleCompiledText(sections = []) {
  return sections.map((section) => section.formattedText).join(
    sections[0]?.metadata?.sectionGap ?? '\n\n',
  );
}
