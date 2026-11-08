"use client";
/** Device side of the lock: asks the ward to trust this device, unlocks the room key, checks the ward is who it was last time. */
import { useCallback, useEffect, useRef, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import { db } from "./firebase";
import { openBus } from "./bus";
import { ROOM } from "./ward";
import { publicRecord, unwrapRoomKey, sealBody, openTree, type PubRecord, type Wrapped } from "./pqc";
import { loadIdentity, loadRoomKey, saveRoomKey, loadPin, savePin } from "./pqstore";

export type PQStatus = "waiting" | "ready" | "changed";

export function usePQDevice(role: "phone" | "family", name: string, authed: boolean) {
  const id = useRef(loadIdentity(role, name)), K = useRef<Uint8Array | null>(null), hubRec = useRef<PubRecord | null>(null);
  const [status, setStatus] = useState<PQStatus>("waiting"), [epoch, setEpoch] = useState(0);
  const bump = () => setEpoch((n) => n + 1);

  useEffect(() => {
    K.current = loadRoomKey(role, false); if (K.current) setStatus("ready");
    const me = id.current, offs: (() => void)[] = [];
    const bus = openBus((m) => { if (m.type === "hello") bus.post({ type: "join", id: me.id }); });
    bus.post({ type: "join", id: me.id });
    offs.push(() => bus.close());
    if (authed) {
      const r = (p: string) => ref(db(), `rooms/${ROOM}/${p}`);
      try {
        update(r(`keys/${me.id}`), publicRecord(me)).catch(() => {});
        offs.push(onValue(r(`wrap/${me.id}`), (s) => {
          const w = s.val() as Wrapped | null; if (!w) return;
          unwrapRoomKey(me.kemSec, w).then((k) => { K.current = k; saveRoomKey(role, k); setStatus((p) => (p === "changed" ? p : "ready")); bump(); }).catch(() => {});
        }));
        // First time we see the ward, remember its fingerprint. If it ever changes, stop believing it.
        offs.push(onValue(r("keys/hub"), (s) => {
          const h = s.val() as PubRecord | null; if (!h) return;
          const pin = loadPin(`wz-pq-hubfp-${role}`);
          if (!pin) { savePin(`wz-pq-hubfp-${role}`, h.fp); hubRec.current = h; }
          else if (pin === h.fp) hubRec.current = h;
          else { hubRec.current = null; setStatus("changed"); }
          bump();
        }));
      } catch { /* offline: local link still works */ }
    }
    return () => offs.forEach((o) => o());
  }, [authed, role]);

  const pubOf = (by: string) => (hubRec.current && by === hubRec.current.id ? hubRec.current.dsa : undefined);
  /** Seal and send a write to the room. Returns false if this device has not been let in yet. */
  const write = useCallback(async (body: Record<string, unknown>) => {
    if (!K.current) return false;
    await update(ref(db(), `rooms/${ROOM}`), await sealBody(body, K.current, id.current)); return true;
  }, []);
  /** Unlock something the ward wrote. Null until this device has the key and has seen the ward's identity. */
  const read = async (path: string, raw: unknown): Promise<unknown> => (!K.current || !hubRec.current || raw == null ? null : (await openTree(raw, K.current, path, pubOf)).value);
  return { status, epoch, write, read, me: id.current };
}
