export function acquireSupportRequestLock(lockRef) {
  if (lockRef.current) return false;
  lockRef.current = true;
  return true;
}

export function releaseSupportRequestLock(lockRef) {
  lockRef.current = false;
}
