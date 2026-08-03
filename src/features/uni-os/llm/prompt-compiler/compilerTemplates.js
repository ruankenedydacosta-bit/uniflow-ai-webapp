export function createCompilerTemplate(section = {}, policy = {}) {
  return Object.freeze({
    title: `${policy.titlePrefix ?? ''}${section.id ?? ''}${policy.titleSuffix ?? ''}`,
    separator: policy.separator ?? '---',
    sectionGap: policy.sectionGap ?? '\n\n',
    includeCompilerMetadata: policy.includeCompilerMetadata === true,
  });
}

export function createCompilerMetadataBlock(section = {}, policy = {}) {
  if (policy.includeCompilerMetadata !== true) return null;
  return Object.freeze({
    sectionId: section.id ?? null,
    priority: section.priority ?? null,
    sourceEstimatedTokens: section.estimatedTokens ?? null,
    sourceMetadata: section.metadata ?? {},
  });
}
