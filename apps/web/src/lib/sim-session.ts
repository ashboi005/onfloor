import type { SimSessionStart } from "@onfloor/contracts";

/**
 * Hands a started sim session from the picker to /simulator/[callId] (survives a refresh).
 * The STT token in `sttUrl` is single-use, so a refreshed page in real mode needs a new session.
 */
const key = (callId: string) => `onfloor:sim:${callId}`;

export function saveSimSession(start: SimSessionStart) {
  try {
    sessionStorage.setItem(key(start.callId), JSON.stringify(start));
  } catch {}
}

export function loadSimSession(callId: string): SimSessionStart | null {
  try {
    const raw = sessionStorage.getItem(key(callId));
    return raw ? (JSON.parse(raw) as SimSessionStart) : null;
  } catch {
    return null;
  }
}
