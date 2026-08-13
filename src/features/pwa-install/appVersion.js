export const LOADED_BUILD_ID = typeof globalThis.__UNIFLOW_BUILD_ID__ === 'string'
  ? globalThis.__UNIFLOW_BUILD_ID__
  : 'development';

export const LOADED_RELEASED_AT = typeof globalThis.__UNIFLOW_RELEASED_AT__ === 'string'
  ? globalThis.__UNIFLOW_RELEASED_AT__
  : null;

export function normalizeBuildId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isDifferentBuild(loadedBuildId, latestBuildId) {
  const loaded = normalizeBuildId(loadedBuildId);
  const latest = normalizeBuildId(latestBuildId);
  return Boolean(loaded && latest && loaded !== latest);
}

export function parseVersionManifest(value) {
  const buildId = normalizeBuildId(value?.buildId);
  if (!buildId) throw new Error('VERSION_MANIFEST_INVALID');
  return Object.freeze({
    buildId,
    releasedAt: typeof value?.releasedAt === 'string' ? value.releasedAt : null,
    title: typeof value?.title === 'string' ? value.title : null,
    description: typeof value?.description === 'string' ? value.description : null,
    novidades: Array.isArray(value?.novidades)
      ? value.novidades.filter((item) => typeof item === 'string')
      : [],
  });
}
