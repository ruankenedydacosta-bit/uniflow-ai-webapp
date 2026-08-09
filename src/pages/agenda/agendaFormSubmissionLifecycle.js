export function createAgendaFormSubmissionLifecycle() {
  let sequence = 0;
  let currentOwner = null;
  let mounted = true;

  return Object.freeze({
    begin() {
      const owner = Object.freeze({ id: ++sequence });
      currentOwner = owner;
      return owner;
    },
    complete(owner) {
      if (currentOwner === owner) currentOwner = null;
    },
    hasActive() {
      return currentOwner !== null;
    },
    invalidate(reason = 'cancelled') {
      sequence += 1;
      currentOwner = null;
      if (reason === 'unmount') mounted = false;
    },
    isCurrent(owner) {
      return mounted && currentOwner === owner;
    },
    isMounted() {
      return mounted;
    },
  });
}

export async function runOwnedAgendaPreOperation({
  lifecycle,
  owner,
  prepare,
  mutate,
  onCancelledPrepared,
}) {
  const prepared = await prepare();
  if (!lifecycle.isCurrent(owner)) {
    if (prepared && onCancelledPrepared) await onCancelledPrepared(prepared);
    return { status: 'cancelled', prepared };
  }

  const result = await mutate(prepared);
  if (!lifecycle.isCurrent(owner)) {
    return { status: 'superseded', prepared, result };
  }

  return { status: 'settled', prepared, result };
}
