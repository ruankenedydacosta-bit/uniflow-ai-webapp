export const AUDIO_STATUS_FILTERS = Object.freeze(['all', 'active', 'disabled']);

const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase('pt-BR');

export function getAudioLibraryOptions(clips, key) {
  return [...new Set(clips.map((clip) => clip[key]).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

export function filterAudioLibrary(clips, filters = {}) {
  const category = normalize(filters.category);
  const context = normalize(filters.context);
  const emotion = normalize(filters.emotion);
  const status = AUDIO_STATUS_FILTERS.includes(filters.status) ? filters.status : 'all';
  const search = normalize(filters.search);

  return clips.filter((clip) => {
    if (category && normalize(clip.category) !== category) return false;
    if (context && normalize(clip.context) !== context) return false;
    if (emotion && normalize(clip.emotion) !== emotion) return false;
    if (status === 'active' && !clip.enabled) return false;
    if (status === 'disabled' && clip.enabled) return false;
    if (search && !normalize(`${clip.id} ${clip.text}`).includes(search)) return false;
    return true;
  });
}

export function getAdjacentPlayableClip(clips, currentId, direction = 1) {
  const playable = clips.filter((clip) => clip.enabled && clip.src);
  if (playable.length === 0) return null;
  const currentIndex = playable.findIndex((clip) => clip.id === currentId);
  const start = currentIndex < 0 ? (direction > 0 ? -1 : 0) : currentIndex;
  const nextIndex = (start + direction + playable.length) % playable.length;
  return playable[nextIndex];
}

export function getAudioLibraryCounts(clips, filteredClips) {
  return Object.freeze({
    total: clips.length,
    active: clips.filter((clip) => clip.enabled).length,
    disabled: clips.filter((clip) => !clip.enabled).length,
    filtered: filteredClips.length,
  });
}

export function getOfficialReviewState(clip) {
  if (clip?.replacementPending) return 'replacement_future';
  if (clip?.reviewStatus === 'approved') return 'approved';
  if (clip && !clip.enabled) return 'safety_disabled';
  return 'unreviewed';
}
