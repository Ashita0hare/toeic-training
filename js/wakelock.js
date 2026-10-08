// Screen Wake Lock wrapper for listen-through mode. Fails silently (returns null) when unsupported.
let lock = null;

export async function acquireWakeLock() {
  try {
    if (!('wakeLock' in navigator)) return null;
    lock = await navigator.wakeLock.request('screen');
    return lock;
  } catch (e) {
    lock = null;
    return null;
  }
}

export async function releaseWakeLock() {
  if (lock) {
    try {
      await lock.release();
    } catch (e) {
      // ignore
    }
    lock = null;
  }
}

export function isWakeLockSupported() {
  return 'wakeLock' in navigator;
}
