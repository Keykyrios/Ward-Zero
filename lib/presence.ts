import { ref, set, update, onValue, onDisconnect, serverTimestamp } from "firebase/database";
import { db, cloudReady } from "./firebase";
import { ROOM } from "./ward";

export type Person = { role: string; name: string; online: boolean; at: number };

/** Who is connected right now: the hub, each caregiver's phone, the family view. Cleared by the server when a device drops. */
export function joinPresence(role: string, name: string) {
  let off = () => {}, dead = false;
  cloudReady().then((uid) => {
    if (dead) return;
    const id = uid ?? `anon-${Math.random().toString(36).slice(2, 8)}`, r = ref(db(), `rooms/${ROOM}/presence/${id}`);
    const un = onValue(ref(db(), ".info/connected"), (c) => {
      if (!c.val()) return;
      onDisconnect(r).update({ online: false, at: serverTimestamp() }).catch(() => {});
      set(r, { role, name, online: true, at: Date.now() }).catch(() => {});
    });
    off = () => { un(); update(r, { online: false, at: Date.now() }).catch(() => {}); };
  });
  return () => { dead = true; off(); };
}

export function watchPresence(cb: (p: Person[]) => void) {
  return onValue(ref(db(), `rooms/${ROOM}/presence`), (s) => {
    const v = (s.val() ?? {}) as Record<string, Person>;
    cb(Object.values(v).filter((p) => p.online));
  }, () => {});
}
