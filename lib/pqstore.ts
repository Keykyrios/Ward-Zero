/** Browser storage for this device's keys. Secret keys never leave the device; only public keys go to the cloud. */
import { makeIdentity, newRoomKey, b64, unb64, type Ident } from "./pqc";

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable: keys last for this tab only */ } };
const mem: Record<string, Ident> = {};

export function loadIdentity(role: string, name: string): Ident {
  if (mem[role]) return mem[role];
  try { const s = get(`wz-pq-id-${role}`); if (s) return (mem[role] = JSON.parse(s) as Ident); } catch { /* regenerate */ }
  const i = makeIdentity(name); put(`wz-pq-id-${role}`, JSON.stringify(i)); return (mem[role] = i);
}
export function loadRoomKey(role: string, create: boolean): Uint8Array | null {
  const s = get(`wz-pq-room-${role}`); if (s) return unb64(s);
  if (!create) return null;
  const k = newRoomKey(); put(`wz-pq-room-${role}`, b64(k)); return k;
}
export const saveRoomKey = (role: string, K: Uint8Array) => put(`wz-pq-room-${role}`, b64(K));
export const loadSet = (k: string): string[] => { try { return JSON.parse(get(k) || "[]"); } catch { return []; } };
export const saveSet = (k: string, v: string[]) => put(k, JSON.stringify(v));
export const loadPin = (k: string) => get(k);
export const savePin = (k: string, v: string) => put(k, v);
