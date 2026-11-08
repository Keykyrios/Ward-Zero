"use client";
import { useEffect, useRef, useState } from "react";
import { ref, onValue, update, query, limitToLast } from "firebase/database";
import { db, cloudReady } from "@/lib/firebase";
import { joinPresence } from "@/lib/presence";
import { openBus } from "@/lib/bus";
import { usePQDevice } from "@/lib/usePQDevice";
import { ROSTER, PROFILES } from "@/lib/engine";
import { ROOM, KIND_LABEL, NEXT_STEP, plain, type Alert } from "@/lib/ward";
import { ScanPanel, type Scan } from "@/components/ward/ScanPanel";
import { Btn, Chip, TIERS } from "@/components/care/ui";
import { cn } from "@/lib/utils";

type Pt = { name: string; news2: number; tier: keyof typeof TIERS; t: number; silent?: boolean };

/** The caregiver's phone: what needs me, what to do first, one big button. */
export default function Phone() {
  const [who, setWho] = useState(0), [alerts, setAlerts] = useState<Record<string, Alert>>({}), [cloud, setCloud] = useState<"connecting" | "live" | "offline">("connecting");
  const [pts, setPts] = useState<Record<string, Pt>>({}), [hub, setHub] = useState<{ online?: boolean }>({}), [duty, setDuty] = useState<boolean[]>([true, true, true]);
  const [trend, setTrend] = useState<Record<string, number[]>>({});
  const [authed, setAuthed] = useState(false), [pid, setPid] = useState("p1"), [note, setNote] = useState(""), [sent, setSent] = useState("");
  useEffect(() => { cloudReady().then(() => setAuthed(true)); }, []);
  useEffect(() => (authed ? joinPresence("caregiver", `${ROSTER[who].name}'s phone`) : undefined), [authed, who]);
  const bus = useRef<ReturnType<typeof openBus> | null>(null);
  const pq = usePQDevice("phone", "Caregiver phone", authed);
  useEffect(() => {
    bus.current = openBus((m) => {
      if (m.type !== "write") return;
      setAlerts((cur) => {
        const next = { ...cur };
        for (const [k, v] of Object.entries(m.w)) if (k.startsWith("alerts/")) next[k.slice(7)] = { ...next[k.slice(7)], ...(v as Alert) };
        return next;
      });
    });
    if (!authed) return () => bus.current?.close();
    let t: ReturnType<typeof setTimeout>; const offs: (() => void)[] = [];
    try {
      const r = (p: string) => ref(db(), `rooms/${ROOM}/${p}`);
      offs.push(onValue(r("alerts"), async (s) => { const v = (await pq.read("alerts", s.val())) as Record<string, Alert> | null; if (v) setAlerts((cur) => ({ ...cur, ...v })); }, () => setCloud("offline")));
      offs.push(onValue(ref(db(), ".info/connected"), (c) => { clearTimeout(t); if (c.val()) setCloud("live"); else t = setTimeout(() => setCloud("offline"), 5000); }));
      offs.push(onValue(r("patients"), async (s) => setPts(((await pq.read("patients", s.val())) ?? {}) as Record<string, Pt>)));
      PROFILES.forEach((p) => offs.push(onValue(query(ref(db(), `rooms/${ROOM}/vitals/${p.id}`), limitToLast(36)), async (sn) => {
        const v = (await pq.read(`vitals/${p.id}`, sn.val())) as Record<string, { news2: number }> | null;
        setTrend((c) => ({ ...c, [p.id]: v ? Object.entries(v).sort((a, b) => +a[0] - +b[0]).map(([, x]) => x.news2) : [] }));
      })));
      offs.push(onValue(r("hub"), (s) => setHub(s.val() ?? {})));
      offs.push(onValue(r("duty"), (s) => { const v = s.val() as Record<string, boolean> | null; if (v) setDuty((d) => d.map((x, i) => (typeof v[i] === "boolean" ? v[i] : x))); }));
    } catch { setCloud("offline"); }
    return () => { offs.forEach((o) => o()); clearTimeout(t); bus.current?.close(); };
  }, [authed, pq.epoch]);
  const list = Object.values(alerts).sort((a, b) => b.created - a.created);
  const mine = list.filter((a) => a.level === who && !a.ackBy), others = list.filter((a) => a.level !== who && !a.ackBy);
  const ack = (a: Alert) => {
    const k = { by: ROSTER[who].name, at: Date.now(), via: "caregiver phone" };
    bus.current?.post({ type: "ack", id: a.id, ...k });
    setAlerts((c) => ({ ...c, [a.id]: { ...a, ackBy: k.by, ackAt: k.at, ackVia: k.via } }));
    pq.write({ [`acks/${a.id}`]: k }).catch(() => {});
  };
  const toggleDuty = () => { const nv = !duty[who]; setDuty((d) => d.map((x, i) => (i === who ? nv : x))); update(ref(db(), `rooms/${ROOM}/duty`), { [who]: nv }).catch(() => {}); };
  const sendNote = () => {
    const text = note.trim(); if (!text) return;
    const id = Date.now().toString(36), n = { pid, text, by: ROSTER[who].name, at: Date.now() };
    bus.current?.post({ type: "write", w: { [`phoneNotes/${id}`]: n } });
    pq.write({ [`phoneNotes/${id}`]: n }).catch(() => {});
    setNote(""); setSent(`Sent. It is now part of ${PROFILES.find((p) => p.id === pid)?.name}'s assessment.`);
  };
  const sendScan = (sc: Scan) => {
    bus.current?.post({ type: "write", w: { [`scans/${sc.id}`]: sc } });
    pq.write({ [`scans/${sc.id}`]: sc }).catch(() => {});
  };
  return (
    <main className="care mx-auto min-h-[100dvh] max-w-md border-x border-care-line">
      <header className="border-b border-care-line px-5 py-5">
        <div className="flex items-center justify-between"><h1 className="font-display text-3xl">Ward Zero</h1>
          <span className={cn("text-[15px]", cloud === "live" ? "text-care-ok" : "text-care-warn")}><span aria-hidden>{cloud === "live" ? "● " : "▲ "}</span>{cloud === "live" ? "Connected" : cloud === "offline" ? "Nearby only" : "Connecting"}</span></div>
        <p className={cn("mt-3 flex items-center gap-1.5 text-[13px]", pq.status === "ready" || (pq.status === "waiting" && cloud !== "live") ? "text-care-ok" : "text-care-warn")}><span aria-hidden>{pq.status === "ready" || (pq.status === "waiting" && cloud !== "live") ? "●" : "▲"}</span>{pq.status === "ready" ? "Locked end to end. Messages are checked." : pq.status === "changed" ? "The ward's identity changed. Its messages are ignored." : cloud !== "live" ? "On the home link. The cloud lock starts when you are online." : "Waiting for the ward to let this phone in."}</p>
        <p className="mt-4 text-sm font-semibold text-care-soft">Signed in as</p>
        <div className="mt-2 grid grid-cols-3 border border-care-line" role="tablist" aria-label="Signed in as">
          {ROSTER.map((r, i) => (
            <button key={r.id} role="tab" aria-selected={who === i} onClick={() => setWho(i)} className={cn("!rounded-none px-3 py-3 text-left", i > 0 && "border-l border-care-line", who === i ? "bg-care-tint shadow-[inset_0_-4px_0_#6adcd1]" : "bg-care-bg")}>
              <div className="font-semibold">{r.name}</div><div className="text-sm text-care-soft">{r.role}</div></button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between"><span>{ROSTER[who].name} is <b className={duty[who] ? "text-care-ok" : "text-care-warn"}>{duty[who] ? "on duty" : "off duty"}</b></span><Btn className="min-h-10 px-4 text-sm" onClick={toggleDuty}>{duty[who] ? "Go off duty" : "Go on duty"}</Btn></div>
      </header>

      <section className="px-5 py-8" aria-label="Needs you" aria-live="polite">
        <h2 className="font-display text-3xl">Needs you <span className="text-xl text-care-soft">{mine.length}</span></h2>
        {mine.length === 0 && <p className="mt-3 text-care-soft">Nothing waiting. Keep this page open and start the demo on the ward screen.</p>}
        {mine.map((a) => (
          <article key={a.id} className={cn("mt-5 border-l-4 p-5", TIERS[a.tier].bg, TIERS[a.tier].edge)}>
            <div className="flex items-start justify-between gap-3"><b className="font-display text-2xl font-normal">{a.name}</b><Chip tier={a.tier} text={KIND_LABEL[a.kind]} /></div>
            <ul className="mt-3 space-y-1 text-[15px] leading-7">{a.why.slice(0, 3).map((w, i) => <li key={i}>{plain(w)}.</li>)}</ul>
            {(a as Alert & { _by?: string })._by && <p className="mt-3 text-[13px] text-care-ok">● Signed by the ward, checked on this phone</p>}
            <p className="mt-4 leading-7"><b>Do this first: </b>{NEXT_STEP[a.kind]}</p>
            <Btn kind="primary" onClick={() => ack(a)} className="mt-5 min-h-14 w-full text-lg">I am on it</Btn>
            <p className="mt-3 text-sm leading-6 text-care-soft">If they look very unwell, call your local emergency number now. This page does not replace that.</p>
          </article>
        ))}
        {others.length > 0 && <p className="mt-6 text-care-soft">{others.length} more alert{others.length > 1 ? "s" : ""} with other caregivers.</p>}
      </section>

      {Object.keys(pts).length > 0 && (
        <section className="border-t border-care-line px-5 py-8" aria-label="Patients now">
          <h2 className="font-display text-3xl">Patients</h2><p className="text-sm text-care-soft">{hub.online ? "Home hub is online" : "Home hub is offline"}</p>
          <ul className="mt-3 border-t border-care-line">{Object.entries(pts).map(([id, q]) => <li key={id} className="flex items-center justify-between gap-3 border-b border-care-line py-3"><span className="flex items-center gap-3">{q.name}<Spark ys={trend[id] ?? []} />{q.silent && <span className="ml-2 text-sm text-care-warn">no readings</span>}</span><Chip tier={q.tier} text={`${TIERS[q.tier].label}, ${q.news2}`} /></li>)}</ul>
        </section>
      )}
      <section className="border-t border-care-line px-5 py-8" aria-label="Add a note">
        <h2 className="font-display text-3xl">Add a note</h2><p className="mt-2 text-care-soft">Say what you see. The ward reads it and can raise the risk.</p>
        <select value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Patient" className="mt-4 min-h-11 w-full border border-care-line bg-care-bg px-3 text-care-text">{PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); sendNote(); }}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="seems confused this morning" aria-label="Note" className="min-h-12 min-w-0 flex-1 border border-care-line bg-care-bg px-3 text-care-text" /><Btn kind="primary">Send</Btn></form>
        {sent && <p role="status" className="mt-3 text-care-ok">{sent}</p>}
      </section>
      <section className="border-t border-care-line bg-care-band px-5 py-8" aria-label="Read a device"><h2 className="font-display text-3xl">Read a device</h2><p className="mt-2 text-care-soft">Take a photo of a pulse oximeter, cuff or thermometer.</p><div className="mt-5"><ScanPanel onScan={sendScan} by={ROSTER[who].name} /></div></section>
    </main>
  );
}

/** Last 18 simulated hours of the score, straight from the cloud history. */
function Spark({ ys }: { ys: number[] }) {
  if (ys.length < 2) return null;
  const w = 72, h = 24, d = ys.map((v, i) => `${i ? "L" : "M"}${((i / (ys.length - 1)) * w).toFixed(1)},${(h - (Math.min(v, 10) / 10) * h).toFixed(1)}`).join("");
  return <svg width={w} height={h} role="img" aria-label={`Score over the last ${ys.length} readings, now ${ys[ys.length - 1]}`}><path d={d} fill="none" strokeWidth={1.5} className="stroke-care-soft" /></svg>;
}
