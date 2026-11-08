"use client";
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db, cloudReady } from "@/lib/firebase";
import { joinPresence } from "@/lib/presence";
import { usePQDevice } from "@/lib/usePQDevice";
import { ROOM } from "@/lib/ward";
import { Chip, TIERS } from "@/components/care/ui";
import type { Tier } from "@/lib/engine";

type Pt = { name: string; news2: number; tier: Tier; t: number; silent?: boolean };
const SAY: Record<Tier, string> = { stable: "is doing fine.", watch: "is being watched a little more closely.", elevated: "needs a nurse now. The care team has been alerted.", critical: "needs emergency help. The care team has been alerted." };

/** A read-only page for relatives. It reads the same live cloud room as the ward and the phone, and shows only plain sentences. */
export default function Family() {
  const [pts, setPts] = useState<Record<string, Pt>>({}), [hub, setHub] = useState<{ online?: boolean; lastSeen?: number }>({}), [ok, setOk] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => { cloudReady().then(() => setAuthed(true)); }, []);
  const pq = usePQDevice("family", "Family view", authed);
  useEffect(() => (authed ? joinPresence("family", "Family view") : undefined), [authed]);
  useEffect(() => {
    if (!authed) return;
    const off: (() => void)[] = [];
    try {
      off.push(onValue(ref(db(), `rooms/${ROOM}/patients`), async (s) => { setPts(((await pq.read("patients", s.val())) ?? {}) as Record<string, Pt>); setOk(true); }, () => setOk(false)));
      off.push(onValue(ref(db(), `rooms/${ROOM}/hub`), (s) => setHub(s.val() ?? {})));
    } catch { /* offline */ }
    return () => off.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, pq.epoch]);
  const list = Object.values(pts);
  return (
    <main className="care min-h-[100dvh]">
      <div className="mx-auto max-w-2xl px-5 py-10 md:py-16">
        <div className="flex items-center justify-between text-[13px] text-care-soft">
          <span className="flex items-center gap-2 font-semibold text-care-text"><span aria-hidden className="grid h-6 w-6 place-items-center rd bg-care-brand text-care-onBrand"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6" /></svg></span>Ward Zero · Family</span>
          <span className={hub.online ? "text-care-ok" : "text-care-warn"}>{pq.status === "changed" ? "▲ The ward changed identity" : pq.status === "waiting" ? "▲ Waiting to be let in" : hub.online ? "● Home hub online, locked end to end" : "▲ Home hub not connected"}</span>
        </div>
        <h1 className="mt-10 text-[34px] font-semibold leading-tight tracking-tight md:text-[44px]">{!ok || !list.length ? "Waiting for the ward." : list.every((p) => p.tier === "stable") ? "Everyone is doing fine." : "The care team is on it."}</h1>
        <p className="mt-3 text-[16px] text-care-soft">{list.length ? "You will see an update here the moment anything changes." : "This page fills in as soon as the ward reports. Nothing to do on your side."}</p>
        <ul className="mt-10 space-y-3">
          {list.length ? list.map((p) => (
            <li key={p.name} className="card border border-care-line bg-care-band p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[20px] font-semibold tracking-tight">{p.name}</span><Chip tier={p.tier} /></div>
              <p className="mt-2 text-[16px] leading-7 text-care-text">{p.name.split(" ")[0]} {p.silent ? "has not sent readings for a while. We are checking." : SAY[p.tier]}</p>
            </li>
          )) : ["Asha Rao", "Vikram Iyer", "Meera Shah"].map((n, i) => (
            <li key={n} className="card flex items-center justify-between gap-4 border border-care-line bg-care-band p-5">
              <div><p className="text-[18px] font-semibold text-care-soft">{n}</p><div className="mt-2 h-2.5 w-44 animate-pulse rd bg-care-tint" style={{ animationDelay: `${i * 200}ms` }} /></div>
              <span className="text-[13px] text-care-soft">Waiting</span>
            </li>
          ))}
        </ul>
        <p className="mt-12 text-xs leading-6 text-care-soft">This is not medical advice. In an emergency call your local emergency number.</p>
      </div>
    </main>
  );
}
