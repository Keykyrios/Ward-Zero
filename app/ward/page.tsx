"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { ref, update, get, onValue, onDisconnect } from "firebase/database";
import { db, cloudReady } from "@/lib/firebase";
import { joinPresence, watchPresence, type Person } from "@/lib/presence";
import { openBus } from "@/lib/bus";
import { fingerprint, sealBody, seal, open as openSealed, openTree, wrapRoomKey, publicRecord, newRoomKey, type Ident, type PubRecord } from "@/lib/pqc";
import { loadIdentity, loadRoomKey, saveRoomKey, loadSet, saveSet } from "@/lib/pqstore";
import {
  PROFILES, ROSTER, ESCALATE_AFTER_S, LABEL, ADVERSE, TICKS_PER_DAY, STEP_MIN,
  initPat, stepPatient, withNote, news2, tierOfNews2, startLevel, advance, clock, dur, fmt, describeFlags, rank,
  type PatState, type Raise, type Tier, type VitalKey,
} from "@/lib/engine";
import { scoreScan, ROOM, KIND_LABEL, NEXT_STEP, clean, plain, type Alert, type LogRow } from "@/lib/ward";
import { ScanPanel, type Scan } from "@/components/ward/ScanPanel";
import { writeBrief, fallbackBrief, type Brief } from "@/lib/brief";
import { makeReport } from "@/lib/report";
import { cn } from "@/lib/utils";
import { Reveal, Glide, Ecg, Spot, Ring, Spark, BreathingOrb } from "@/components/care/fx";
import { AnimatePresence, motion } from "motion/react";
import ScrollBar from "@/components/ScrollBar";
import { Guide } from "@/components/care/Guide";
import { SignalPath } from "@/components/care/SignalPath";
import { BodyMap } from "@/components/care/BodyMap";
import { PhoneFrame } from "@/components/care/PhoneFrame";
import { ObsChart } from "@/components/care/ObsChart";
import { Btn, Chip, Notice, TIERS } from "@/components/care/ui";


type Store = {
  run: string; t: number; pats: Record<string, PatState>; alerts: Alert[]; log: LogRow[]; logN: number;
  duty: boolean[]; resp: number[][]; off: Record<string, boolean>; link: boolean; outbox: Record<string, unknown>[]; pend: Record<string, unknown>; scans: (Scan & { total: number; tier: Tier })[]; seen: Set<string>;
  counts: { readings: number; scored: number; forecasts: number; alerts: number; acks: number };
};
const fresh = (): Store => ({
  run: Date.now().toString(36), t: 0, pats: Object.fromEntries(PROFILES.map((p) => [p.id, initPat(p)])), alerts: [], log: [], logN: 0,
  duty: [true, true, true], resp: [[], [], []], off: {}, link: true, outbox: [], pend: {}, scans: [], seen: new Set<string>(), counts: { readings: 0, scored: 0, forecasts: 0, alerts: 0, acks: 0 },
});
type Fb = "connecting" | "live" | "denied" | "offline";
const NOTE_CHIPS = ["seems confused this morning", "wound looks red and swollen", "a bit breathless on the stairs"];
/** Plain-language reading of the Royal College of Physicians NEWS2 response bands. */
const GUIDE: Record<Tier, string> = {
  stable: "Routine monitoring continues. Nothing needs you right now.",
  watch: "A clinician should take an urgent look.",
  elevated: "This needs an urgent clinical response.",
  critical: "Emergency response. If they look very unwell, call emergency services now.",
};
const VERB: Record<Tier, string> = { stable: "is stable", watch: "needs a closer look", elevated: "needs an urgent response", critical: "needs emergency help now" };

export default function Ward() {
  const S = useRef<Store>(null as unknown as Store);
  if (!S.current) S.current = fresh();
  const [, tick] = useReducer((x: number) => x + 1, 0);
  // Simulation can run at 12 ticks a second; the screen only repaints about 4 times a second.
  const lastPaint = useRef(0), paintT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const force = () => {
    const n = performance.now();
    if (n - lastPaint.current > 250) { lastPaint.current = n; tick(); }
    else if (!paintT.current) paintT.current = setTimeout(() => { paintT.current = null; lastPaint.current = performance.now(); tick(); }, 250);
  };
  const [briefs, setBriefs] = useState<Record<string, Brief | "loading">>({}), [pdfBusy, setPdfBusy] = useState(false);
  const ctlRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (ctlRef.current) ctlRef.current.open = window.matchMedia("(min-width:1024px)").matches; }, []);
  const [tab, setTab] = useState<"overview" | "readings" | "handover" | "team">("overview"), [run, setRun] = useState(true), [speed, setSpeed] = useState(0.5), [sel, setSel] = useState("p1");
  const [note, setNote] = useState(""), [fb, setFb] = useState<Fb>("connecting");
  const bus = useRef<ReturnType<typeof openBus> | null>(null), fbRef = useRef<Fb>("connecting");
  // Keys: this screen holds the room key. Devices it trusts get a copy locked to their own key.
  const pq = useRef<{ id: Ident; K: Uint8Array } | null>(null);
  const getPQ = () => (pq.current ??= { id: loadIdentity("hub", "Ward screen"), K: loadRoomKey("hub", true)! });
  const [devs, setDevs] = useState<Record<string, PubRecord>>({}), [trusted, setTrusted] = useState<string[]>([]), [forged, setForged] = useState(0);
  const devsRef = useRef<Record<string, PubRecord>>({}), trustedRef = useRef<string[]>([]), wrapped = useRef(new Set<string>());
  const approve = (id: string) => { if (trustedRef.current.includes(id)) return; trustedRef.current = [...trustedRef.current, id]; saveSet("wz-pq-trust", trustedRef.current); setTrusted(trustedRef.current); };
  const pubOf = (id: string) => (id === getPQ().id.id ? getPQ().id.dsaPub : devsRef.current[id]?.dsa);
  /** Lose a phone? Stop trusting it: a new room key is made and only the remaining devices get it. */
  const distrust = (id: string) => {
    const q = getPQ(); q.K = newRoomKey(); saveRoomKey("hub", q.K);
    trustedRef.current = trustedRef.current.filter((x) => x !== id); saveSet("wz-pq-trust", trustedRef.current); setTrusted(trustedRef.current);
    wrapped.current.clear(); update(ref(db(), `rooms/${ROOM}`), { [`wrap/${id}`]: null, [`keys/${id}`]: null }).catch(() => {});
    say("info", "Device removed. A new key was made, so it can no longer read anything new."); force();
  };
  fbRef.current = fb;
  const s = S.current;

  const say = (tone: LogRow["tone"], text: string) => {
    const x = S.current; x.log = [{ id: ++x.logN, at: Date.now(), t: x.t, tone, text }, ...x.log].slice(0, 60);
  };
  const fail = (e: unknown, body?: Record<string, unknown>) => {
    if (String((e as { code?: string })?.code ?? e).toUpperCase().includes("PERMISSION")) setFb("denied");
    else if (body) S.current.outbox.push(body);
  };
  const push = (body: Record<string, unknown>) => { const q = getPQ(); return sealBody(body, q.K, q.id).then((sb) => update(ref(db(), `rooms/${ROOM}`), sb)); };
  /** Cloud path respects the outage (ordered store-and-forward). The local home-network path always works. */
  const send = (w: Record<string, unknown>) => {
    const x = S.current, body = clean(w);
    const local = Object.fromEntries(Object.entries(body).filter(([k]) => k.startsWith("alerts/")));
    if (Object.keys(local).length) bus.current?.post({ type: "write", w: local });
    if (fbRef.current === "denied") return;
    if (!x.link) { x.outbox.push(body); return; }
    push(body).catch((e) => fail(e, body));
  };
  const flush = () => {
    const x = S.current, q = x.outbox.splice(0);
    if (!q.length) return;
    q.reduce((p, body) => p.then(() => push(body)), Promise.resolve())
      .then(() => { say("ok", `Internet is back. ${q.length} saved updates were sent in order.`); force(); })
      .catch((e) => fail(e));
  };
  const applyAck = (id: string, k: { by: string; at: number; via: string }) => {
    const x = S.current; let changed = false;
    x.alerts = x.alerts.map((a) => {
      if (a.id !== id || a.ackBy) return a;
      changed = true; x.counts.acks++; x.resp[a.level].push((k.at - a.levelSince) / 1000);
      say("ok", `${a.name}: acknowledged by ${k.by} on the ${k.via}.`);
      return { ...a, ackBy: k.by, ackAt: k.at, ackVia: k.via };
    });
    if (changed) force();
  };
  const raiseAlert = (p: PatState, r: Raise) => {
    const x = S.current, lv = startLevel(r.kind, r.tier, x.duty), now = Date.now();
    const a: Alert = { id: `${x.run}-${p.p.id}-${x.t}-${r.kind}`, pid: p.p.id, name: p.p.name, tier: r.tier, kind: r.kind, score: r.score, why: r.why, t: x.t,
      level: lv.level, created: now, levelSince: now, escalations: 0 };
    x.alerts = [a, ...x.alerts]; x.counts.alerts++;
    say(rank(r.tier) >= 2 ? "crit" : "warn", `${KIND_LABEL[r.kind]} alert for ${p.p.name} (${TIERS[r.tier].label}) sent to ${ROSTER[lv.level].name}${lv.skipped.length ? `, skipped off-duty ${lv.skipped.map((i) => ROSTER[i].name).join(", ")}` : ""}.`);
    send({ [`alerts/${a.id}`]: a, [`log/${a.id}`]: { t: x.t, kind: r.kind, tier: r.tier, to: ROSTER[lv.level].name } });
  };

  const applyNote = (id: string, n: { pid: string; text: string; by: string }) => {
    const x = S.current; if (x.seen.has(`note-${id}`) || !x.pats[n.pid]) return;
    x.seen.add(`note-${id}`); x.pats[n.pid] = withNote(x.pats[n.pid], n.text);
    const f = describeFlags(x.pats[n.pid].flags);
    say("info", `Note from ${n.by} for ${x.pats[n.pid].p.name}: "${n.text}". Read as: ${f.length ? f.join(", ") : "nothing actionable"}.`); force();
  };
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [authed, setAuthed] = useState(false), [people, setPeople] = useState<Person[]>([]);
  useEffect(() => { cloudReady().then(() => setAuthed(true)); }, []);
  useEffect(() => {
    bus.current = openBus((m) => {
      if (m.type === "join") approve(m.id); // a device on this home link is trusted without a click
      if (m.type === "ack") applyAck(m.id, m);
      if (m.type === "write") for (const [k, v] of Object.entries(m.w)) if (k.startsWith("scans/")) applyScan(v as Scan); else if (k.startsWith("phoneNotes/")) applyNote(k.slice(11), v as { pid: string; text: string; by: string });
    });
    trustedRef.current = loadSet("wz-pq-trust"); setTrusted(trustedRef.current);
    bus.current.post({ type: "hello" });
    return () => bus.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everything that touches the cloud waits for the anonymous sign-in to settle.
  useEffect(() => {
    if (!authed) return;
    const offs: (() => void)[] = [], r = (p: string) => ref(db(), `rooms/${ROOM}/${p}`);
    let t: ReturnType<typeof setTimeout>;
    try {
      offs.push(onValue(ref(db(), ".info/connected"), (c) => {
        clearTimeout(t);
        if (c.val()) setFb((p) => (p === "denied" ? p : "live"));
        else t = setTimeout(() => setFb((p) => (p === "denied" ? p : "offline")), 5000);
      }));
      update(r("hub"), { startedAt: Date.now(), online: true }).catch((e) => fail(e));
      const q = getPQ();
      update(r("keys/hub"), publicRecord(q.id)).catch(() => {});
      offs.push(onValue(r("keys"), (s) => { const v = (s.val() ?? {}) as Record<string, PubRecord>; devsRef.current = v; setDevs(v); }));
      /** Open what the cloud sent. Anything unsealed, altered or unsigned by a known device is dropped. */
      const openCloud = async (path: string, raw: unknown) => {
        let res = await openTree(raw, getPQ().K, path, pubOf);
        if (res.dropped) { try { devsRef.current = ((await get(r("keys"))).val() ?? {}) as Record<string, PubRecord>; res = await openTree(raw, getPQ().K, path, pubOf); } catch { /* offline */ } }
        if (res.dropped) setForged((n) => n + res.dropped);
        return res.value;
      };
      onDisconnect(r("hub")).update({ online: false, lastSeen: Date.now() }).catch(() => {});
      offs.push(joinPresence("hub", "Ward screen"), watchPresence((p) => setPeople(p)));
      // Alerts outlive the tab: a reload or a second ward screen picks up where the room left off.
      get(r("alerts")).then(async (snap) => {
        const v = (await openCloud("alerts", snap.val())) as Record<string, Alert> | null, x = S.current;
        if (!v || !Object.keys(v).length || x.alerts.length) return;
        x.alerts = Object.values(v).sort((a, b) => b.created - a.created).slice(0, 40);
        x.counts.alerts = x.alerts.length; say("info", `Restored ${x.alerts.length} alerts from the cloud.`); force();
      }).catch((e) => fail(e));
      offs.push(onValue(r("acks"), async (snap) => {
        const v = (await openCloud("acks", snap.val())) as Record<string, { by: string; at: number; via: string }> | null;
        if (v) Object.entries(v).forEach(([id, k]) => applyAck(id, k));
      }, (e) => fail(e)));
      offs.push(onValue(r("duty"), (snap) => {
        const v = snap.val() as Record<string, boolean> | null; if (!v) return;
        const x = S.current, next = x.duty.map((d, i) => (typeof v[i] === "boolean" ? v[i] : d));
        if (next.some((d, i) => d !== x.duty[i])) { x.duty = next; say("info", "Duty roster updated from a caregiver phone."); force(); }
      }, (e) => fail(e)));
      offs.push(onValue(r("scans"), async (snap) => {
        const v = (await openCloud("scans", snap.val())) as Record<string, Scan> | null; if (v) Object.values(v).forEach((sc) => applyScan(sc));
      }, (e) => fail(e)));
      // Notes typed on a caregiver's phone go straight into the risk reading.
      offs.push(onValue(r("phoneNotes"), async (snap) => {
        const v = (await openCloud("phoneNotes", snap.val())) as Record<string, { pid: string; text: string; by: string }> | null; if (!v) return;
        for (const [id, n] of Object.entries(v)) applyNote(id, n);
      }, (e) => fail(e)));
    } catch { setFb("offline"); }
    return () => { clearTimeout(t); offs.forEach((o) => o()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // The edge hub: sense, understand, predict, gate, alert. One step is one reading from every sensor.
  const stepOnce = () => {
    const x = S.current, t = x.t + 1, w: Record<string, unknown> = {};
    x.t = t;
    for (const p of PROFILES) {
      const o = stepPatient(x.pats[p.id], t, !!x.off[p.id]);
      x.pats[p.id] = o.s;
      if (o.r) {
        x.counts.readings++; x.counts.scored++; if (o.s.f.ready) x.counts.forecasts++;
        w[`vitals/${p.id}/${t}`] = { ...o.r, news2: o.s.a.total, tier: o.s.a.tier, p24: o.s.f.ready ? o.s.f.p24 : null, buffered: !x.link };
      }
      o.raise.forEach((r) => raiseAlert(o.s, r));
    }
    Object.assign(x.pend, w);
  };
  // A reading every two seconds: slow enough to read, and only the parts that changed repaint.
  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => { stepOnce(); force(); }, 1000 / speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, speed]);
  const skip = (n: number) => { for (let i = 0; i < n; i++) stepOnce(); lastPaint.current = 0; force(); };

  // Escalation clock runs in real seconds and never pauses with the simulation.
  useEffect(() => {
    const id = setInterval(() => {
      const x = S.current, now = Date.now(); let changed = false;
      x.alerts = x.alerts.map((a) => {
        if (a.ackBy) return a;
        const adv = advance(a.level, x.duty, (now - a.levelSince) / 1000);
        if (adv.level === a.level) return a;
        changed = true;
        say("crit", `${a.name}: escalated to ${ROSTER[adv.level].name} (${adv.timedOut ? `no acknowledgement within ${ESCALATE_AFTER_S}s` : `${ROSTER[a.level].name} is off duty`}).`);
        const n = { ...a, level: adv.level, levelSince: now, escalations: a.escalations + 1 };
        send({ [`alerts/${a.id}`]: n });
        return n;
      });
      if (changed) force();
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Give each trusted device its own locked copy of the room key.
  useEffect(() => {
    if (!authed) return;
    const q = getPQ();
    for (const [id, rec] of Object.entries(devs)) {
      if (id === "hub" || !trusted.includes(id) || wrapped.current.has(id)) continue;
      wrapped.current.add(id);
      wrapRoomKey(rec.kem, q.K).then((w) => update(ref(db(), `rooms/${ROOM}/wrap/${id}`), w)).catch(() => wrapped.current.delete(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devs, trusted, authed]);

  // Cloud writes are batched: one update a second carries every reading plus a live summary per patient.
  useEffect(() => {
    // Buffered writes survive a page reload, and are retried every few seconds while the internet is up.
    // The saved copy is locked with the room key, so health data is not sitting readable in the browser.
    (async () => { try { const raw = localStorage.getItem("wz-outbox"); if (!raw) return; const q = raw.startsWith("pq1.") ? (await openSealed(getPQ().K, "outbox", raw, pubOf)).data : []; if (Array.isArray(q) && q.length) { S.current.outbox.unshift(...q); force(); } } catch { /* unreadable or storage unavailable */ } })();
    let n = 0, lastLen = -1;
    const id = setInterval(() => {
      const x = S.current; n++;
      if (x.outbox.length !== lastLen) { lastLen = x.outbox.length; { const q = getPQ(); seal(q.K, q.id, "outbox", x.outbox.slice(-500)).then((tok) => { try { localStorage.setItem("wz-outbox", tok); } catch { /* ignore */ } }).catch(() => {}); } }
      if (x.link && x.outbox.length && fbRef.current !== "denied" && n % 5 === 0) flush();
      if (!Object.keys(x.pend).length) return;
      const body: Record<string, unknown> = { ...x.pend, "hub/t": x.t, "hub/lastSeen": Date.now() };
      x.pend = {};
      for (const p of PROFILES) {
        const q = x.pats[p.id], l = q.hist[q.hist.length - 1];
        if (l) body[`patients/${p.id}`] = { name: p.name, news2: q.a.total, tier: q.a.tier, p24: q.f.ready && q.f.confidence !== "none" ? q.f.p24 : null, t: l.t, rr: l.rr, spo2: l.spo2, sys: l.sys, hr: l.hr, temp: l.temp, silent: !!x.off[p.id] && q.gapTicks > 0 };
      }
      send(body);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyScan = (sc: Scan) => {
    const x = S.current; if (x.seen.has(sc.id) || !x.pats[sc.pid]) return;
    x.seen.add(sc.id);
    const P = x.pats[sc.pid], last = P.hist[P.hist.length - 1];
    const { v, n, tier } = scoreScan(P, sc);
    x.scans = [{ ...sc, total: n.total, tier }, ...x.scans].slice(0, 6);
    say(rank(tier) >= 2 ? "crit" : "info", `${P.p.name}: reading photographed by ${sc.by} (${sc.device}) scores ${n.total}, ${TIERS[tier].label}.`);
    if (rank(tier) >= 2) raiseAlert(P, { kind: "current", tier, score: n.total, why: [`Photographed reading scores NEWS2 ${n.total}`, ...n.parts.filter((q) => q.pts > 0 && q.key !== "loc").map((q) => `${LABEL[q.key as VitalKey]} ${fmt(q.key as VitalKey, v[q.key as VitalKey])} adds ${q.pts}`)].slice(0, 4) });
    force();
  };
  const onScan = (sc: Scan) => {
    applyScan(sc);
    bus.current?.post({ type: "write", w: { [`scans/${sc.id}`]: sc } });
    send({ [`scans/${sc.id}`]: sc });
  };
  const brief = async () => {
    const x = S.current, P0 = x.pats[sel]; setBriefs((b) => ({ ...b, [sel]: "loading" }));
    const b = await writeBrief(P0, x.alerts); setBriefs((c) => ({ ...c, [sel]: b }));
  };
  const pdf = async () => {
    const x = S.current, P0 = x.pats[sel]; setPdfBusy(true);
    try {
      const cur = briefs[sel], b = cur && cur !== "loading" ? cur : fallbackBrief(P0, x.alerts);
      const name = await makeReport(P0, x.alerts, x.log, b, x.t);
      say("ok", `Handover report for ${P0.p.name} saved as ${name}.`);
      send({ [`reports/${Date.now().toString(36)}`]: { pid: P0.p.id, name, at: Date.now(), news2: P0.a.total, tier: P0.a.tier, by: b.model } });
    } finally { setPdfBusy(false); force(); }
  };

  const ack = (a: Alert) => {
    const x = S.current, by = ROSTER[a.level].name, at = Date.now(), k = { by, at, via: "hub screen" };
    applyAck(a.id, k);
    if (fbRef.current !== "denied") {
      if (x.link) update(ref(db(), `rooms/${ROOM}/acks`), { [a.id]: k }).catch((e) => fail(e)); else x.outbox.push({ [`acks/${a.id}`]: k });
    }
    bus.current?.post({ type: "ack", id: a.id, ...k });
  };
  const toggleLink = () => {
    const x = S.current; x.link = !x.link;
    if (x.link) { say("info", "Internet is back."); flush(); } else say("warn", "Internet outage started. The home hub keeps watching and alerting, and saves every update to send later.");
    force();
  };
  const toggleSensor = () => {
    const x = S.current, on = !x.off[sel]; x.off[sel] = on;
    say(on ? "warn" : "info", on ? `${x.pats[sel].p.name}: sensor switched off.` : `${x.pats[sel].p.name}: sensor back on.`); force();
  };
  const addNote = (text: string) => {
    const x = S.current; x.pats[sel] = withNote(x.pats[sel], text);
    const f = describeFlags(x.pats[sel].flags);
    say("info", `Note for ${x.pats[sel].p.name}: "${text}". Read as: ${f.length ? f.join(", ") : "nothing actionable"}.`);
    send({ [`notes/${sel}/${x.t}`]: { text, t: x.t } }); setNote(""); force();
  };
  const reset = () => {
    if (fbRef.current !== "denied") update(ref(db(), `rooms/${ROOM}`), { alerts: null, acks: null, scans: null, vitals: null, patients: null, phoneNotes: null, log: null, notes: null, reports: null }).catch(() => {});
    S.current = fresh(); setSel("p1"); setNote(""); force(); };

  const P = s.pats[sel], A = P.a, open = s.alerts.filter((a) => !a.ackBy).filter((a, i, all) => all.findIndex((b) => b.pid === a.pid) === i), ready = P.hist.length > 0;
  const stale = !!s.off[sel] && P.gapTicks > 0, last = P.hist[P.hist.length - 1], lastT = last ? last.t : 0;
  const wallClock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });
  const TIER_ORDER: Tier[] = ["stable", "watch", "elevated", "critical"];
  const net = fb === "denied" ? "Saving paused" : fb === "offline" ? "Offline" : fb === "connecting" ? "Connecting" : "Synced";
  const topOpen = [...(open.filter((a) => a.tier === s.pats[a.pid].a.tier).length ? open.filter((a) => a.tier === s.pats[a.pid].a.tier) : open)].sort((a, b) => rank(b.tier) - rank(a.tier) || b.created - a.created)[0];

  const live = PROFILES.map((p) => s.pats[p.id]).filter((q) => q.hist.length > 0);
  const worst = live.reduce((m, q) => Math.max(m, rank(q.a.tier)), 0);
  const worstNames = live.filter((q) => rank(q.a.tier) === worst).map((q) => q.p.name);
  const trending = live.filter((q) => q.f.confidence !== "none" && q.f.p24 >= 5 && rank(q.a.tier) < 2);
  const many = worstNames.length > 1;
  const headline = !live.length ? "Waiting for the first readings."
    : worst === 0 && trending.length ? `${trending[0].p.name} is stable now, but trending the wrong way.`
    : worst === 0 ? "Everyone is stable."
    : `${worstNames.join(" and ")} ${[null, many ? "need a closer look" : "needs a closer look", many ? "need an urgent response" : "needs an urgent response", many ? "need emergency help now" : "needs emergency help now"][worst]}.`;

  const parts = ready ? Object.fromEntries(news2(last, { scale2: P.p.scale2, confusion: P.flags.confusion }).parts.map((q) => [q.key, q.pts])) : {} as Record<string, number>;
  const toneOf = (tier: Tier) => tier === "stable" ? "stroke-care-ok" : tier === "watch" ? "stroke-care-warn" : tier === "elevated" ? "stroke-care-hot" : "stroke-care-crit";
  const tabs: [typeof tab, string, number?][] = [["overview", "Overview"], ["readings", "Readings"], ["handover", "Handover"], ["team", "Care team", open.length]];
  const ctl = "rd min-h-9 border border-care-line bg-care-band px-3 text-left text-[13px] font-medium text-care-text transition-colors hover:border-care-brand hover:text-care-brand";
  const linkTxt = !s.link ? `No internet, ${s.outbox.length} updates saved` : fb === "live" ? "Live" : "Running locally";

  return (
    <main className="care ward-app min-h-[100dvh] lg:flex lg:h-[100dvh] lg:overflow-hidden">
      {/* ================= sidebar: people first, controls second */}
      <aside className="border-b border-care-line bg-care-band lg:flex lg:w-[284px] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="px-5 pb-3 pt-4">
          <Link href="/" className="flex w-fit items-center gap-2 text-[15px] font-semibold tracking-tight"><span aria-hidden className="grid h-6 w-6 place-items-center bg-care-brand text-care-onBrand rd"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2-6 4 12 2-6h6" /></svg></span>Ward Zero</Link>
          <p className={cn("mt-2 flex items-center gap-1.5 text-xs", s.link ? "text-care-ok" : "text-care-warn")}><span aria-hidden>{s.link ? "●" : "▲"}</span>{linkTxt}</p>
        </div>
        <p className="px-5 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-care-soft">Patients</p>
        <div className="grid grid-cols-3 gap-px px-2 lg:grid-cols-1 lg:gap-0.5" role="tablist" aria-label="Patients" data-tour="patients">
          {PROFILES.map((p) => {
            const q = s.pats[p.id], on = sel === p.id, off = !!s.off[p.id] && q.gapTicks > 0, ok = q.hist.length > 0, t = TIERS[q.a.tier];
            return (
              <button key={p.id} role="tab" aria-selected={on} onClick={() => setSel(p.id)}
                className={cn("rd relative min-w-0 px-3 py-2.5 text-left transition-colors lg:px-3 lg:py-3", on ? "bg-care-tint" : "hover:bg-care-tint/60")}>
                {on && <motion.span layoutId="sel" className="absolute inset-y-2 left-0 w-[3px] bg-care-brand" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[14px] font-semibold">{p.name}</span>
                  {ok ? <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", t.txt)}><span aria-hidden>{t.glyph}</span><span className="hidden lg:inline">{t.label}</span></span> : <span className="text-xs text-care-soft">Waiting</span>}
                </span>
                <span className="mt-0.5 hidden truncate text-xs text-care-soft lg:block">{p.age}, {p.cond.split(",")[0]}{off ? " · no signal" : ""}</span>
                <span className="mt-2 hidden items-end justify-between lg:flex">
                  <span className="num text-[26px] font-semibold leading-none tracking-tight">{ok ? <Glide value={q.a.total} /> : "–"}<span className="ml-1 text-xs font-normal text-care-soft">score</span></span>
                  <Spark ys={q.scores.slice(-30)} w={96} h={26} tone={toneOf(q.a.tier)} />
                </span>
              </button>
            );
          })}
        </div>

        <details ref={ctlRef} data-tour="controls" className="mt-4 border-t border-care-line px-5 py-4">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.12em] text-care-soft lg:pointer-events-none">Try something going wrong</summary>
          <div className="mt-3 grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            <button className={ctl} onClick={() => setRun(!run)}>{run ? "⏸ Pause time" : "▶ Play time"}</button>
            <button className={ctl} onClick={() => setSpeed(speed === 0.5 ? 2 : speed === 2 ? 12 : speed === 12 ? 0.25 : 0.5)}>Pace: {({ 0.25: "Slow", 0.5: "Normal", 2: "Fast", 12: "Very fast" } as Record<number, string>)[speed]}</button>
            <button className={ctl} onClick={() => skip(12)}>Skip ahead 6 hours</button>
            <button className={ctl} onClick={toggleLink}>{s.link ? "Cut the internet" : "Bring internet back"}</button>
            <button className={ctl} onClick={toggleSensor}>{s.off[sel] ? "Turn sensor back on" : `Switch off ${P.p.name.split(" ")[0]}'s sensor`}</button>
            <button className={ctl} onClick={reset}>Start over</button>
          </div>
        </details>

        <div className="mt-auto space-y-2 border-t border-care-line px-5 py-4">
          <p className="num text-xs text-care-soft">{clock(s.t)}</p>
          <p className="flex items-center gap-1.5 text-xs text-care-soft"><span aria-hidden className="text-care-ok">●</span>Locked end to end, quantum-safe</p>
          <Link href="/phone" target="_blank" className="rd flex min-h-9 items-center justify-center bg-care-brand text-[13px] font-semibold text-care-onBrand hover:bg-care-brandHover">Open caregiver phone</Link>
          <Link href="/family" className="rd flex min-h-9 items-center justify-center border border-care-line text-[13px] font-medium hover:border-care-brand hover:text-care-brand">Family view</Link>
        </div>
      </aside>

      {/* ================= workspace */}
      <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
        <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-care-line bg-care-bg px-5 py-3 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-[18px] font-semibold tracking-tight">{P.p.name}</h1>
            {ready && <Chip tier={A.tier} className="rd" />}
            <span className="hidden truncate text-[13px] text-care-soft md:inline">{P.p.age}, {P.p.cond.split(",")[0]}</span>
          </div>
          <nav aria-label="Views" className="ml-auto flex items-center gap-1">
            {tabs.map(([k, l, n]) => (
              <button key={k} onClick={() => setTab(k)} aria-current={tab === k} className={cn("rd relative px-3 py-1.5 text-[13px] font-medium transition-colors", tab === k ? "bg-care-tint text-care-text" : "text-care-soft hover:text-care-text")}>
                {l}{!!n && <span className="num ml-1.5 inline-grid min-w-[18px] place-items-center bg-care-crit px-1 text-[11px] font-semibold text-white rd">{n}</span>}
              </button>))}
          </nav>
        </header>

        <div aria-live="polite">
          <AnimatePresence initial={false}>{topOpen && (
            <motion.div key={topOpen.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
              <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-l-4 px-5 py-3 md:px-8", TIERS[topOpen.tier].bg, TIERS[topOpen.tier].edge)}>
                <p className="min-w-0 text-[14px] leading-6"><span className={cn("font-semibold", TIERS[topOpen.tier].txt)}><span aria-hidden className="mr-1.5 text-xs">{TIERS[topOpen.tier].glyph}</span>{topOpen.name}: {KIND_LABEL[topOpen.kind].toLowerCase()}, {TIERS[topOpen.tier].label.toLowerCase()}.</span>{" "}<span className="text-care-text">{plain(topOpen.why[0])}. {NEXT_STEP[topOpen.kind]}</span></p>
                <div className="flex items-center gap-4 text-[13px]">{open.length > 1 && <button className="underline" onClick={() => setTab("team")}>{open.length - 1} more waiting</button>}<button className="rd min-h-8 bg-care-brand px-3 font-semibold text-care-onBrand hover:bg-care-brandHover" onClick={() => ack(topOpen)}>I am on it</button></div>
              </div>
            </motion.div>)}</AnimatePresence>
        </div>

        <div className="flex-1 lg:overflow-y-auto">
          <div className="mx-auto max-w-[1280px] px-5 py-6 md:px-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab + sel} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>

                {/* ---------------- overview */}
                {tab === "overview" && (!ready ? <p className="text-care-soft">No readings yet.</p> : (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0 space-y-5">
                      <div className="card relative overflow-hidden border border-care-line bg-care-band">
                        <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-5">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-care-soft">Right now</p>
                            <p className={cn("mt-1 text-[22px] font-semibold tracking-tight md:text-[26px]", TIERS[A.tier].txt)}>{P.p.name.split(" ")[0]} {VERB[A.tier]}</p>
                            <p className="mt-1 text-[14px] text-care-soft">{stale ? `No readings for ${dur(P.gapTicks * STEP_MIN)}. Check the sensor and the person.` : GUIDE[A.tier]}</p>
                          </div>
                          <div className="flex items-end gap-6"><div className="hidden w-[260px] sm:block"><RiskBar score={A.total} /></div><div className="text-right"><p className="num text-[52px] font-semibold leading-none tracking-tight"><Glide value={A.total} /></p><p className="mt-1 text-xs text-care-soft">early warning score</p></div></div>
                        </div>
                        <div className="mt-2 h-12 opacity-90"><Ecg bpm={last ? last.hr : 75} tone={toneOf(A.tier)} paused={!run} className="h-12 w-full" /></div>
                      </div>

                      <div data-tour="tiles" className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        {VITAL_NAMES.map(([k, name, unit]) => {
                          const pts = (parts as Record<string, number>)[k] ?? 0, v = last[k], base = P.baseline?.med[k], ys = P.hist.slice(-24).map((h) => h[k]);
                          const tone = pts >= 3 ? "stroke-care-crit" : pts > 0 ? "stroke-care-warn" : "stroke-care-ok";
                          return (
                            <div key={k} className={cn("card border p-3.5 last:col-span-2 md:last:col-span-1", pts >= 3 ? "border-care-crit/50 bg-care-critBg" : pts > 0 ? "border-care-warn/40 bg-care-warnBg" : "border-care-line bg-care-band")}>
                              <div className="flex items-center justify-between text-[12px] font-medium text-care-soft"><span className="truncate">{name}</span>{pts > 0 && <span className="rd bg-care-bg px-1.5 py-0.5 normal-case tracking-normal text-care-text">+{pts}</span>}</div>
                              <div className="mt-2 flex items-baseline gap-1 num"><span className="text-[32px] font-semibold leading-none tracking-tight"><Glide value={v} decimals={k === "temp" ? 1 : 0} /></span><span className="text-xs text-care-soft">{unit}</span></div>
                              <p className="mt-1 text-xs text-care-soft num">{base !== undefined ? `Usual ${fmt(k, base)}` : "Learning usual"}</p>
                              <div className="mt-2 overflow-hidden"><Spark ys={ys} w={120} h={30} tone={tone} minSpan={MINSPAN[k]} /></div>
                            </div>);
                        })}
                      </div>

                      <div className="grid gap-5 lg:grid-cols-2">
                        <div data-tour="why" className="card border border-care-line bg-care-band p-5">
                          <h2 className="text-[15px] font-semibold">Why this score</h2>
                          <div className="mt-4">
                            <div className="space-y-4 text-[15px] leading-7">
                  {([["news2", "What raised the score"], ["baseline", "Compared with their own usual"], ["context", "From the notes"]] as const).map(([k, h]) => { const rs = A.reasons.filter((r) => r.kind === k); if (!rs.length) return null; return (<div key={k}><p className="mb-1 text-sm font-semibold text-care-soft">{h}</p><ul className="space-y-1">{rs.map((r, i) => <li key={i} className="flex gap-2"><span aria-hidden className="text-care-soft">–</span><span>{plain(r.text).replace(/ the patient's own baseline of /, " their usual ").replace(/ the patient's own /, " their usual ")}</span></li>)}</ul></div>); })}
                  {!A.reasons.length && <p>Every reading is in its normal range.</p>}
                </div>
                            {A.raised && <p className="mt-3 text-[13px] leading-6 text-care-warn">{A.raised}</p>}
                          </div>
                          <details className="mt-4 border-t border-care-line pt-3"><summary className="cursor-pointer text-[13px] font-medium text-care-soft hover:text-care-text">Show the full working</summary>
                            <div className="mt-3 text-[13px]"><table className="w-full text-[13px] num"><thead><tr className="text-left text-sm text-care-soft"><th className="py-2 font-normal">Vital sign</th><th className="font-normal">Reading</th><th className="text-right font-normal">Points added</th></tr></thead>
                <tbody>{news2(last, { scale2: P.p.scale2, confusion: P.flags.confusion }).parts.map((q) => <tr key={q.key} className="border-t border-care-line"><td className="py-2">{q.key === "loc" ? "Alertness" : VITAL_NAMES.find((v) => v[0] === q.key)?.[1]}</td><td>{q.key === "loc" ? (P.flags.confusion ? "New confusion noted" : "Alert") : fmt(q.key as VitalKey, last[q.key as VitalKey])}</td><td className="text-right font-semibold">{q.pts}</td></tr>)}
                  <tr className="border-t-2 border-care-text"><td className="py-2 font-semibold">Total</td><td /><td className="text-right text-lg font-semibold">{A.total}</td></tr></tbody></table>
                              <p className="mt-3 text-xs leading-5 text-care-soft">Points follow the NEWS2 chart from the Royal College of Physicians. 0 to 2 stable, 3 to 4 watch (or any single 3), 5 to 6 urgent, 7 or more emergency.</p></div>
                          </details>
                        </div>
                        <div data-tour="forecast" className="card border border-care-line bg-care-band p-5">
                          <h2 className="text-[15px] font-semibold">The next two days</h2>
                          <div className="mt-4"><Forecast P={P} /></div>
                        </div>
                      </div>
                    </div>

                    {/* right rail: how the alert travels, and the phone it lands on */}
                    <aside data-tour="rail" className="min-w-0 space-y-5">
                      <div className="card border border-care-line bg-care-band p-4">
                        <h2 className="mb-3 text-[15px] font-semibold">How alerts travel</h2>
                        <SignalPath running={run} sensorsOk={!Object.values(s.off).some(Boolean)} sensorsText={Object.values(s.off).some(Boolean) ? "One silent" : "3 live"} linkUp={s.link} cloudText={!s.link ? `${s.outbox.length} waiting` : fb === "live" ? "Synced" : "Local"} phoneOnline={phoneOpen || people.some((q) => q.role === "caregiver")} />
                      </div>
                      <PhoneFrame onReady={() => setPhoneOpen(true)} />
                    </aside>
                  </div>))}

                {/* ---------------- readings */}
                {tab === "readings" && (!ready ? <p className="text-care-soft">No readings yet.</p> : (
                  <div className="space-y-5">
                    <div data-tour="chart" className="card border border-care-line bg-care-band p-5">
                      <h2 className="text-[15px] font-semibold">Recent readings</h2>
                      <p className="mt-1 text-[13px] text-care-soft">Newest on the right. A tinted box is out of range, hatched grey means the sensor sent nothing.</p>
                      <div className="mt-4 overflow-x-auto"><ObsChart hist={P.hist} scale2={P.p.scale2} /></div>
                    </div>
                    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                      <div className="card border border-care-line bg-care-band p-5">
                        <h2 className="text-[15px] font-semibold">Where each reading comes from</h2>
                        <div className="mt-2"><BodyMap v={last} pts={parts as Record<string, number>} silent={stale} /></div>
                        <p className="mt-1 text-xs text-care-soft num">Reading from {clock(lastT)}</p>
                      </div>
                      <div className="card border border-care-line bg-care-band p-5">
                        <h2 className="text-[15px] font-semibold">Add a note</h2>
                        <p className="mt-1 text-[13px] text-care-soft">Say what you see, in plain words. It can raise attention, never lower it.</p>
                        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote(note.trim()); }}>
                          <label className="sr-only" htmlFor="note">Note about {P.p.name}</label>
                          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: more breathless today" className="rd min-h-10 min-w-0 flex-1 border border-care-line bg-care-bg px-3 text-[14px] text-care-text outline-none focus:border-care-brand" />
                          <button className="rd min-h-10 bg-care-brand px-4 text-[14px] font-semibold text-care-onBrand hover:bg-care-brandHover">Add</button>
                        </form>
                        <div className="mt-3 flex flex-wrap gap-2">{NOTE_CHIPS.map((c) => <button key={c} onClick={() => addNote(c)} className="rd border border-care-line px-2.5 py-1.5 text-[13px] hover:border-care-brand hover:text-care-brand">{c}</button>)}</div>
                        {describeFlags(P.flags).length > 0 && <p className="mt-4 text-[13px] leading-6 text-care-soft">Read from your note: <b className="text-care-text">{describeFlags(P.flags).join(", ")}</b>. Matched on keywords, so check it makes sense. <button className="underline" onClick={() => { S.current.pats[sel] = withNote(S.current.pats[sel], ""); say("info", "Note cleared."); force(); }}>Clear note</button></p>}
                      </div>
                    </div>
                  </div>))}

                {/* ---------------- handover */}
                {tab === "handover" && (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div data-tour="summary" className="card border border-care-line bg-care-band p-5">
                      <h2 className="text-[15px] font-semibold">Handover summary</h2>
                      <p className="mt-1 text-[13px] leading-6 text-care-soft">A short written summary for the family and the next clinician, built only from the readings and the score. Save it as a PDF to hand over.</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button className="rd min-h-10 bg-care-brand px-4 text-[14px] font-semibold text-care-onBrand hover:bg-care-brandHover disabled:opacity-40" onClick={brief} disabled={!ready || briefs[sel] === "loading"}>{briefs[sel] === "loading" ? "Writing..." : briefs[sel] ? "Write it again" : `Write summary for ${P.p.name.split(" ")[0]}`}</button>
                        <button data-tour="pdf" className="rd min-h-10 border border-care-line px-4 text-[14px] font-medium hover:border-care-brand hover:text-care-brand disabled:opacity-40" onClick={pdf} disabled={!ready || pdfBusy}>{pdfBusy ? "Building PDF..." : "Download PDF"}</button>
                      </div>
                      {(() => { const b = briefs[sel]; return b && b !== "loading" ? (
              <div className="rd mt-5 space-y-4 bg-care-bg p-5">
                <p className="text-[17px] font-medium leading-snug">{b.family}</p>
                <dl className="space-y-3 text-[13px] leading-6">{(Object.entries(b.sbar) as [string, string][]).map(([k, v]) => <div key={k} className="grid grid-cols-[120px_1fr] gap-4"><dt className="font-semibold capitalize">{k}</dt><dd>{v}</dd></div>)}</dl>
                <p className="text-sm text-care-soft">{b.model.startsWith("template") ? "Written from the readings, no AI used." : "Written by AI from these readings, then checked against them."}</p>
              </div>) : null; })()}
                    </div>
                    <div data-tour="scan" className="card border border-care-line bg-care-band p-5">
                      <h2 className="text-[15px] font-semibold">Read a device</h2>
                      <p className="mt-1 text-[13px] leading-6 text-care-soft">Take a photo of a pulse oximeter, blood pressure cuff or thermometer. The numbers are read from the screen and given the same score.</p>
                      <div className="mt-4"><ScanPanel onScan={onScan} by="Hub" defaultPid={sel} /></div>
                      {s.scans.length > 0 && <ul className="mt-5 border-t border-care-line">{s.scans.map((c) => <li key={c.id} className="flex items-center justify-between gap-4 border-b border-care-line py-3"><span>{s.pats[c.pid].p.name} <span className="text-care-soft">from a {c.device}</span></span><Chip tier={c.tier} text={`${TIERS[c.tier].label}, score ${c.total}`} /></li>)}</ul>}
                    </div>
                  </div>)}

                {/* ---------------- care team */}
                {tab === "team" && (
                  <div data-tour="alerts">
                    <p className="mb-6 max-w-xl text-[14px] text-care-soft">Who is on duty, who has been told, and who has answered. If nobody answers, the alert moves to the next person.</p>
                    <div className="grid gap-10 xl:grid-cols-[1.3fr_1fr]">
          <div>
            <h3 className="text-[15px] font-semibold">Waiting for an answer <span className="font-normal text-care-soft">({open.length})</span></h3>
            {open.length === 0 && <p className="mt-4 border-t border-care-line pt-5 text-care-soft">Nothing waiting. When something changes, the alert appears here with the reason and the first thing to do.</p>}
            <div className="mt-4">
              <AnimatePresence initial={false}>{open.slice(0, 5).map((a) => (
                <motion.article layout key={a.id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className={cn("card mb-3 border border-l-4 p-4", TIERS[a.tier].bg, TIERS[a.tier].edge)}>
                  <div className="flex flex-wrap items-center justify-between gap-3"><b className="text-[16px] font-semibold">{a.name}</b><Chip tier={a.tier} text={`${KIND_LABEL[a.kind]}, ${TIERS[a.tier].label.toLowerCase()}`} /></div>
                  <p className="mt-2 text-[14px] leading-6">{plain(a.why[0])}.</p>
                  <p className="mt-1 text-[13px] leading-6 text-care-soft">{NEXT_STEP[a.kind]}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-[13px] text-care-soft">With {ROSTER[a.level].name}{a.escalations ? `, passed on ${a.escalations} time${a.escalations > 1 ? "s" : ""}` : ""}</span><Btn kind="primary" onClick={() => ack(a)}>I am on it</Btn></div>
                </motion.article>
              ))}</AnimatePresence>
              {open.length > 5 && <p className="text-sm text-care-soft">{open.length - 5} older alerts are waiting too.</p>}
            </div>
            {s.alerts.some((a) => a.ackBy) && (
              <details className="mt-8 border-t border-care-line pt-5"><summary className="cursor-pointer font-semibold">Answered ({s.alerts.filter((a) => a.ackBy).length})</summary>
                <ul className="mt-3">{s.alerts.filter((a) => a.ackBy).slice(0, 10).map((a) => <li key={a.id} className="border-b border-care-line py-3 text-[15px] leading-7"><b>{a.name}</b>, {KIND_LABEL[a.kind].toLowerCase()} ({TIERS[a.tier].label.toLowerCase()}). Answered by {a.ackBy} on the {a.ackVia}.</li>)}</ul></details>
            )}
          </div>
          <div data-tour="protection" className="card self-start border border-care-line bg-care-band p-5">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold"><svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-care-ok" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>Protection</h3>
            <p className="mt-2 text-[13px] leading-6 text-care-soft">Everything sent to the cloud is locked, and every message is signed, so it cannot be read or faked on the way. The locks are built to hold against quantum computers.</p>
            <ul className="mt-3 space-y-2 text-[13px]">
              <li className="rd flex items-center justify-between gap-3 border border-care-line px-3 py-2"><div><p className="font-semibold">Ward screen <span className="font-normal text-care-soft">(this one)</span></p><p className="num text-xs text-care-soft">{fingerprint(getPQ().id.dsaPub)}</p></div><span className="text-care-ok">● Trusted</span></li>
              {Object.entries(devs).filter(([id]) => id !== "hub").map(([id, d]) => (
                <li key={id} className="rd flex items-center justify-between gap-3 border border-care-line px-3 py-2"><div className="min-w-0"><p className="truncate font-semibold">{d.name}</p><p className="num text-xs text-care-soft">{d.fp}</p></div>
                  {trusted.includes(id) ? <button className="rd min-h-8 border border-care-line px-2.5 text-xs hover:border-care-crit hover:text-care-crit" onClick={() => distrust(id)}>Stop trusting</button> : <button className="rd min-h-8 bg-care-brand px-3 text-xs font-semibold text-care-onBrand hover:bg-care-brandHover" onClick={() => approve(id)}>Approve</button>}</li>))}
            </ul>
            {Object.keys(devs).filter((id) => id !== "hub").length === 0 && <p className="mt-2 text-xs text-care-soft">Phones and family screens appear here when they ask to join. Ones on this home network are trusted automatically.</p>}
            {forged > 0 && <p className="mt-3 text-[13px] text-care-warn">▲ {forged} forged or unreadable message{forged > 1 ? "s were" : " was"} ignored.</p>}
            <p className="mt-3 text-xs leading-5 text-care-soft">ML-KEM-768 key exchange, ML-DSA-65 signatures, AES-256-GCM records.</p>
            <h3 className="mt-7 text-[15px] font-semibold">Connected now</h3>
            <ul className="mt-3 flex flex-wrap gap-2">{(people.length || phoneOpen) ? [...people, ...(phoneOpen && !people.some((q) => q.role === "caregiver") ? [{ name: "Caregiver phone", role: "caregiver", online: true, at: 0 } as Person] : [])].map((q, i) => <li key={i} className="border border-care-line px-3 py-1.5 text-[15px]"><span aria-hidden className="mr-2 text-care-ok">●</span>{q.name}</li>) : <li className="text-care-soft">Only this screen. Open the caregiver phone or the family view to see them appear here live.</li>}</ul>
            <h3 className="mt-7 text-[15px] font-semibold">On duty</h3>
            <ul className="mt-4 border-t border-care-line">
              {ROSTER.map((c, i) => {
                const r = s.resp[i], avg = r.length ? `answers in ${(r.reduce((a, b) => a + b, 0) / r.length).toFixed(0)} seconds on average` : "has not answered yet";
                return (
                  <li key={c.id} className="flex items-center justify-between gap-4 border-b border-care-line py-4">
                    <div><p className="font-semibold">{c.name} <span className="font-normal text-care-soft">{c.role}</span></p><p className="text-sm text-care-soft">{s.duty[i] ? "On duty" : "Off duty"}, {avg}</p></div>
                    <Btn className="min-h-10 px-4 text-sm" onClick={() => { S.current.duty = S.current.duty.map((d, j) => (j === i ? !d : d)); say("info", `${c.name} ${S.current.duty[i] ? "checked in" : "checked out"}.`); send({ [`duty/${i}`]: S.current.duty[i] }); force(); }}>{s.duty[i] ? "Go off duty" : "Go on duty"}</Btn>
                  </li>
                );
              })}
            </ul>
            <details className="mt-7"><summary className="cursor-pointer text-[15px] font-semibold">Activity history</summary>
              <ol className="mt-3 max-h-[360px] overflow-auto border-t border-care-line">
                {s.log.length === 0 && <li className="py-4 text-care-soft">Every alert, answer and note is recorded here with its time.</li>}
                {s.log.map((l) => <li key={l.id} className="grid grid-cols-[72px_1fr] gap-3 border-b border-care-line py-3 text-[15px] leading-6"><span className="text-care-soft num">{wallClock(l.at)}</span><span>{l.text}</span></li>)}
              </ol>
            </details>
          </div>
        </div>
                  </div>)}

              </motion.div>
            </AnimatePresence>
            <p className="mt-10 border-t border-care-line pt-5 text-xs leading-6 text-care-soft">Simulated sensors and synthetic data. The early warning score is NEWS2, published by the Royal College of Physicians. This software is not a medical device, has not been clinically validated, and does not replace professional care or emergency services. In an emergency call your local emergency number.</p>
          </div>
        </div>
      </div>
      <Guide tab={tab} setTab={setTab} />
    </main>
  );
}

const MINSPAN: Record<string, number> = { rr: 10, spo2: 8, sys: 40, hr: 30, temp: 1.5 };
const VITAL_NAMES: [VitalKey, string, string][] = [["rr", "Breathing", "per min"], ["spo2", "Oxygen", "%"], ["sys", "Blood pressure", "mmHg"], ["hr", "Pulse", "bpm"], ["temp", "Temperature", "°C"]];

/** Four bands on one line, with a marker. Position carries the meaning; labels and colour back it up. */
function RiskBar({ score }: { score: number }) {
  const segs: [string, number, string][] = [["Stable", 3, "bg-care-ok"], ["Watch", 2, "bg-care-warn"], ["Urgent", 2, "bg-care-hot"], ["Emergency", 3, "bg-care-crit"]];
  const at = ((Math.min(score, 9) + 0.5) / 10) * 100;
  return (
    <div className="mx-auto mt-6 w-full max-w-sm" role="img" aria-label={`Score ${score}. Bands: stable 0 to 2, watch 3 to 4, urgent 5 to 6, emergency 7 and above.`}>
      <div className="relative h-3 pt-0"><div className="flex h-3">{segs.map(([l, w, c]) => <div key={l} className={cn("h-3", c)} style={{ width: `${w * 10}%`, opacity: 0.85, marginRight: 2 }} />)}</div>
        <div className="absolute -top-2 h-7 w-[3px] bg-care-text" style={{ left: `calc(${at}% - 1.5px)` }} /></div>
      <div className="mt-3 flex text-xs text-care-soft">{segs.map(([l, w]) => <div key={l} style={{ width: `${w * 10}%` }}>{l}</div>)}</div>
    </div>
  );
}

/** Score history for the last 2 simulated days. A projection to +24h and +48h is drawn only when the trends agree. */
function Forecast({ P }: { P: PatState }) {
  const F = P.f, W = 420, H = 200, past = P.scores.slice(-TICKS_PER_DAY * 2), n = past.length;
  if (!n) return <p className="text-care-soft">Waiting for the first reading.</p>;
  if (!F.ready) return <p className="text-care-soft">Learning this patient. A forecast needs 6 hours of readings ({P.hist.length} of 12 so far).</p>;
  const show = F.confidence !== "none", span = n - 1 + TICKS_PER_DAY * 2, X = (i: number) => (i / Math.max(1, span)) * W, Y = (v: number) => H - (Math.min(v, 12) / 12) * H;
  const d = past.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const last = past[n - 1], pts = [[n - 1, last], [n - 1 + TICKS_PER_DAY, F.p24], [n - 1 + TICKS_PER_DAY * 2, F.p48]] as const;
  const dash = pts.map(([i, v], k) => `${k ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const adverse = F.trends.filter((t) => ADVERSE[t.key] * t.perDay > 0);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" role="img" aria-label={show ? `NEWS2 now ${last}, projected ${F.p24} in 24 hours and ${F.p48} in 48 hours` : `NEWS2 now ${last}, no adverse trend`}>
        <rect x={0} y={Y(7)} width={W} height={Y(5) - Y(7)} className="fill-care-hot/10" /><rect x={0} y={0} width={W} height={Y(7)} className="fill-care-crit/10" />
        <text x={4} y={Y(5) - 5} className="fill-care-hot" fontSize={15}>Urgent from 5</text><text x={4} y={Y(7) - 5} className="fill-care-crit" fontSize={15}>Emergency from 7</text>
        <line x1={X(n - 1)} x2={X(n - 1)} y1={0} y2={H} className="stroke-care-line" />
        <path d={d} fill="none" className="stroke-care-text" strokeWidth={2} />
        {show && <path d={dash} fill="none" className="stroke-care-hot" strokeWidth={2} strokeDasharray="5 5" />}
        {show && pts.slice(1).map(([i, v]) => <rect key={i} x={X(i) - 4} y={Y(v) - 4} width={8} height={8} className="fill-care-hot" />)}
        <text x={X(n - 1)} y={H + 18} textAnchor="middle" className="fill-care-soft" fontSize={15}>now</text>
        {show && <><text x={X(n - 1 + TICKS_PER_DAY)} y={H + 18} textAnchor="middle" className="fill-care-soft" fontSize={15}>+24h</text>
          <text x={X(n - 1 + TICKS_PER_DAY * 2) - 2} y={H + 18} textAnchor="end" className="fill-care-soft" fontSize={15}>+48h</text></>}
      </svg>
      {show ? (
        <>
          <div className="mt-6 grid grid-cols-4 gap-4 num">
            {[["Now", last], ["+24h", F.p24], ["+48h", F.p48]].map(([l, v]) => <div key={l}><div className="text-sm text-care-soft">{l}</div><div className="mt-1 text-4xl font-semibold">{v}</div></div>)}
            <div><div className="text-sm text-care-soft">How sure</div><div className="mt-2 text-lg text-care-hot">{F.confidence}</div></div>
          </div>
          <ul className="mt-6 space-y-2 leading-7 text-care-text">{adverse.map((t) => <li key={t.key}>{LABEL[t.key]} trending {t.perDay > 0 ? "up" : "down"} {Math.abs(t.perDay)} per day, projected {fmt(t.key, t.to24)} in 24 h</li>)}</ul>
        </>
      ) : <p className="mt-6 text-care-soft">Steady. No vital is trending the wrong way, so there is nothing to project.</p>}
    </div>
  );
}
