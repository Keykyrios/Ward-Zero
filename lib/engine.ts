/**
 * Ward Zero risk engine. Pure and deterministic: no I/O, no React, no clocks.
 *
 * Scoring follows the Royal College of Physicians NEWS2 chart (2017). Everything beyond the chart
 * (personal baseline deviation, caregiver-note context, trend projection) is computed separately and
 * labelled as such wherever it is shown, so the validated score is never silently modified.
 * This is a demonstration prototype, not a medical device.
 */

export type VitalKey = "rr" | "spo2" | "sys" | "hr" | "temp";
export type V = Record<VitalKey, number>;
export type Reading = V & { t: number };
export type Tier = "stable" | "watch" | "elevated" | "critical";
export type Kind = "current" | "predicted" | "signal" | "gap";

/** NEWS2 chart order (airway/breathing first). */
export const VITALS: VitalKey[] = ["rr", "spo2", "sys", "hr", "temp"];
export const TIERS: Tier[] = ["stable", "watch", "elevated", "critical"];
export const rank = (t: Tier) => TIERS.indexOf(t);
export const LABEL: Record<VitalKey, string> = { rr: "Respiration", spo2: "SpO2", sys: "Systolic BP", hr: "Pulse", temp: "Temperature" };
export const STEP_MIN = 30; // one tick = 30 simulated minutes
export const START_MIN = 6 * 60; // simulation starts 06:00 on day 1
export const TICKS_PER_DAY = 48;

export const clock = (t: number) => {
  const m = START_MIN + t * STEP_MIN;
  const hh = Math.floor((m % 1440) / 60), mm = m % 60;
  return `Day ${1 + Math.floor(m / 1440)}, ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
/** 90 -> "90 min", 1620 -> "27 h". */
export const dur = (min: number) => (min < 120 ? `${min} min` : `${Math.round(min / 60)} h`);
export const fmt = (k: VitalKey, v: number) =>
  k === "temp" ? `${v.toFixed(1)} °C` : k === "spo2" ? `${v}%` : k === "rr" ? `${v}/min` : k === "hr" ? `${v} bpm` : `${v} mmHg`;

/* ------------------------------------------------------------------ simulated patients */

export type Profile = {
  id: string; name: string; age: number; cond: string; story: string;
  scale2: boolean; seed: number; base: V; drift: Partial<V>; onset: number;
};

export const PROFILES: Profile[] = [
  { id: "p1", name: "Asha Rao", age: 72, cond: "COPD, clinician-set SpO2 target 88 to 92", story: "Slow respiratory decline",
    scale2: true, seed: 11, base: { rr: 18, spo2: 91, sys: 134, hr: 78, temp: 36.7 }, drift: { spo2: -0.09, hr: 0.4, rr: 0.14, sys: -0.2 }, onset: 20 },
  { id: "p2", name: "Vikram Iyer", age: 81, cond: "Post-op day 3, hip repair", story: "Post-operative infection pattern",
    scale2: false, seed: 23, base: { rr: 16, spo2: 97, sys: 126, hr: 82, temp: 36.9 }, drift: { temp: 0.03, hr: 0.4, sys: -0.3, rr: 0.06 }, onset: 34 },
  { id: "p3", name: "Meera Shah", age: 65, cond: "Hypertension, stable", story: "Control patient: should raise nothing",
    scale2: false, seed: 37, base: { rr: 15, spo2: 98, sys: 138, hr: 72, temp: 36.6 }, drift: {}, onset: 99999 },
];

/** Stateless hash noise in (-1, 1), triangular. Same inputs always give the same value. */
function noise(seed: number, t: number, i: number) {
  const h = (k: number) => {
    let x = (seed ^ Math.imul(t + 1, 0x9e3779b1) ^ Math.imul(i + k, 0x85ebca6b)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d); x = Math.imul(x ^ (x >>> 15), 0x846ca68b); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
  return h(7) + h(91) - 1;
}

/** Decline plateaus: the first stretch is linear, then it saturates so no simulated vital leaves a survivable range. */
const PLATEAU = 80;
export function sense(p: Profile, t: number): Reading {
  const k = PLATEAU * Math.tanh(Math.max(0, t - p.onset) / PLATEAU);
  const hour = ((START_MIN + t * STEP_MIN) / 60) % 24;
  const circadian = Math.sin(((hour - 16) / 24) * 2 * Math.PI); // temperature peaks late afternoon
  const val = (key: VitalKey, amp: number, i: number) => p.base[key] + (p.drift[key] ?? 0) * k + amp * noise(p.seed, t, i);
  return {
    t,
    rr: Math.round(val("rr", 1, 0)),
    hr: Math.round(val("hr", 2.5, 1)),
    spo2: Math.min(100, Math.round(val("spo2", 0.7, 2))),
    sys: Math.round(val("sys", 3, 3)),
    temp: +(val("temp", 0.1, 4) + 0.12 * circadian).toFixed(1),
  };
}

/* ------------------------------------------------------------------ NEWS2 (RCP 2017 chart) */

const rrPts = (v: number) => (v <= 8 ? 3 : v <= 11 ? 1 : v <= 20 ? 0 : v <= 24 ? 2 : 3);
const spo2Scale1 = (v: number) => (v <= 91 ? 3 : v <= 93 ? 2 : v <= 95 ? 1 : 0);
/** Scale 2 on air: 88 or above scores 0 (the 93+ on oxygen rows are not modelled; the simulator is on air). */
const spo2Scale2 = (v: number) => (v <= 83 ? 3 : v <= 85 ? 2 : v <= 87 ? 1 : 0);
const sysPts = (v: number) => (v <= 90 ? 3 : v <= 100 ? 2 : v <= 110 ? 1 : v <= 219 ? 0 : 3);
const hrPts = (v: number) => (v <= 40 ? 3 : v <= 50 ? 1 : v <= 90 ? 0 : v <= 110 ? 1 : v <= 130 ? 2 : 3);
const tempPts = (v: number) => (v <= 35.0 ? 3 : v <= 36.0 ? 1 : v <= 38.0 ? 0 : v <= 39.0 ? 1 : 2);

export type Part = { key: VitalKey | "loc"; label: string; val: string; pts: number };
export type N2 = { parts: Part[]; total: number; anyRed: boolean };

export function news2(r: V, o: { scale2: boolean; confusion?: boolean }): N2 {
  const pts: Record<VitalKey, number> = {
    rr: rrPts(r.rr), spo2: o.scale2 ? spo2Scale2(r.spo2) : spo2Scale1(r.spo2), sys: sysPts(r.sys), hr: hrPts(r.hr), temp: tempPts(r.temp),
  };
  const parts: Part[] = VITALS.map((k) => ({
    key: k, label: k === "spo2" && o.scale2 ? "SpO2 (scale 2)" : LABEL[k], val: fmt(k, r[k]), pts: pts[k],
  }));
  if (o.confusion) parts.push({ key: "loc", label: "Consciousness (new confusion)", val: "C", pts: 3 });
  return { parts, total: parts.reduce((s, x) => s + x.pts, 0), anyRed: parts.some((x) => x.pts === 3) };
}

/** The 0-point band for each vital, used to shade charts exactly as the NEWS2 chart does. */
export const zeroBand = (k: VitalKey, scale2: boolean): [number, number] =>
  ({ rr: [12, 20], spo2: scale2 ? [88, 100] : [96, 100], sys: [111, 219], hr: [51, 90], temp: [36.1, 38.0] } as Record<VitalKey, [number, number]>)[k];

/**
 * RCP clinical risk bands: 0-4 low, a single 3 is low-medium (urgent ward-based review),
 * 5-6 medium (urgent response), 7+ high (emergency response).
 */
export const tierOfNews2 = (total: number, anyRed: boolean): Tier =>
  total >= 7 ? "critical" : total >= 5 ? "elevated" : total >= 3 || anyRed ? "watch" : "stable";

/* ------------------------------------------------------------------ robust statistics */

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mad = (a: number[]) => { const m = median(a); return median(a.map((x) => Math.abs(x - m))); };
const theilSen = (ys: number[]) => {
  const sl: number[] = [];
  for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) sl.push((ys[j] - ys[i]) / (j - i));
  return median(sl);
};

/** +1 means "a rise is worse", -1 means "a fall is worse". */
export const ADVERSE: Record<VitalKey, 1 | -1> = { rr: 1, spo2: -1, sys: -1, hr: 1, temp: 1 };
const FLOOR: V = { rr: 1.2, spo2: 0.8, sys: 4, hr: 3, temp: 0.2 };

/* ------------------------------------------------------------------ personal baseline */

export type Baseline = { ready: boolean; n: number; med: V; scale: V };
export const LEARN_N = 16; // first 8 simulated hours

export function learnBaseline(h: Reading[]): Baseline {
  const w = h.slice(0, LEARN_N), med = {} as V, scale = {} as V;
  for (const k of VITALS) {
    const xs = w.map((r) => r[k]);
    med[k] = +median(xs).toFixed(2);
    scale[k] = Math.max(FLOOR[k], 1.4826 * mad(xs));
  }
  return { ready: h.length >= LEARN_N, n: Math.min(h.length, LEARN_N), med, scale };
}

export type Deviation = { key: VitalKey; z: number; delta: number; base: number; now: number };

/** A vital deviates when it sits at least 3 robust sigmas on the harmful side of the patient's own baseline for 3 readings in a row. */
export function deviations(b: Baseline, recent: Reading[]): Deviation[] {
  if (!b.ready || recent.length < 3) return [];
  const last = recent.slice(-3), out: Deviation[] = [];
  for (const k of VITALS) {
    const zs = last.map((r) => (ADVERSE[k] * (r[k] - b.med[k])) / b.scale[k]);
    if (zs.every((z) => z >= 3)) {
      out.push({ key: k, z: +(zs.reduce((a, c) => a + c, 0) / 3).toFixed(1), delta: +(last[2][k] - b.med[k]).toFixed(1), base: b.med[k], now: last[2][k] });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ caregiver notes (context) */

export type NoteFlags = { confusion: boolean; symptom: boolean; infection: boolean };
export const NO_FLAGS: NoteFlags = { confusion: false, symptom: false, infection: false };
/** Keyword reading is deliberately simple and always shown back to the caregiver. Negation ("not confused") is a known limitation. */
export const readNote = (text: string): NoteFlags => {
  const n = text.toLowerCase();
  return {
    confusion: /confus|disorient|drowsy|not making sense|agitat/.test(n),
    symptom: /breathless|short of breath|chest (pain|tight)|dizz|faint|not eating|vomit/.test(n),
    infection: /\bwound\b|\bred(ness)?\b|swollen|swelling|\bpus\b|discharge|fever|chills|shiver/.test(n),
  };
};
export const describeFlags = (f: NoteFlags) =>
  [f.confusion && "confusion", f.symptom && "symptom", f.infection && "possible infection sign"].filter(Boolean) as string[];

/* ------------------------------------------------------------------ assessment */

export type Reason = { kind: "news2" | "context" | "baseline"; text: string };
export type Assessment = {
  t: number; total: number; tier: Tier; baseTier: Tier; scale2: boolean;
  parts: Part[]; flags: NoteFlags; devs: Deviation[]; reasons: Reason[]; raised: string;
};

export function assess(r: Reading, o: { scale2: boolean; flags: NoteFlags; baseline: Baseline | null; recent: Reading[] }): Assessment {
  const n = news2(r, { scale2: o.scale2, confusion: o.flags.confusion });
  const baseTier = tierOfNews2(n.total, n.anyRed);
  const devs = o.baseline ? deviations(o.baseline, o.recent) : [];
  const reasons: Reason[] = n.parts.filter((p) => p.pts > 0).sort((a, b) => b.pts - a.pts)
    .map((p) => ({ kind: "news2", text: `${p.label} ${p.val} adds ${p.pts}` }));
  if (o.flags.confusion) reasons.push({ kind: "context", text: "Note mentions confusion, scored as NEWS2 consciousness. Confirm it is new." });
  if (o.flags.symptom) reasons.push({ kind: "context", text: "Note mentions a symptom. Not part of NEWS2, so it only raises attention." });
  if (o.flags.infection) reasons.push({ kind: "context", text: "Note mentions a possible infection sign. Not part of NEWS2, so it only raises attention." });
  for (const d of devs) {
    reasons.push({ kind: "baseline", text: `${LABEL[d.key]} ${fmt(d.key, d.now)} is ${Math.abs(d.delta)} ${d.delta > 0 ? "above" : "below"} the patient's own baseline of ${d.base}` });
  }
  // Bounded nudge: context and baseline signals can lift STABLE to WATCH and nothing more.
  const nudge = o.flags.symptom || o.flags.infection || devs.length >= 2;
  const raised = baseTier === "stable" && nudge ? "Raised from stable to watch by context or personal-baseline signals, not by the vital signs alone." : "";
  return { t: r.t, total: n.total, tier: raised ? "watch" : baseTier, baseTier, scale2: o.scale2, parts: n.parts, flags: o.flags, devs, reasons, raised };
}

/* ------------------------------------------------------------------ forecast (damped robust trend, re-scored with NEWS2) */

export type Trend = { key: VitalKey; perDay: number; snr: number; to24: number };
export type Forecast = { ready: boolean; confidence: "none" | "low" | "moderate"; p24: number; p48: number; v24: V | null; v48: V | null; trends: Trend[] };
export const EMPTY_FORECAST: Forecast = { ready: false, confidence: "none", p24: 0, p48: 0, v24: null, v48: null, trends: [] };
const WIN = 24, MIN_WIN = 12, PHI = 0.98;
const LIMITS: Record<VitalKey, [number, number]> = { rr: [4, 40], spo2: [60, 100], sys: [60, 260], hr: [25, 200], temp: [33, 42] };
/** Gardner-McKenzie damped trend: the effective number of steps flattens as the horizon grows. */
const damp = (h: number) => (PHI * (1 - Math.pow(PHI, h))) / (1 - PHI);

export function forecast(recent: Reading[], scale2: boolean): Forecast {
  const w = recent.slice(-WIN);
  if (w.length < MIN_WIN) return EMPTY_FORECAST;
  const v24 = {} as V, v48 = {} as V, trends: Trend[] = [];
  for (const k of VITALS) {
    const ys = w.map((r) => r[k]), s = theilSen(ys);
    const icpt = median(ys.map((y, i) => y - s * i));
    const level = icpt + s * (ys.length - 1);
    const sd = Math.max(1.4826 * mad(ys.map((y, i) => y - (icpt + s * i))), FLOOR[k] * 0.5);
    const snr = (Math.abs(s) * (ys.length - 1)) / sd;
    const trending = snr >= 3;
    const proj = (ticks: number) => Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], trending ? level + s * damp(ticks) : level));
    const rnd = (x: number) => (k === "temp" ? +x.toFixed(1) : Math.round(x));
    v24[k] = rnd(proj(TICKS_PER_DAY)); v48[k] = rnd(proj(TICKS_PER_DAY * 2));
    if (trending) trends.push({ key: k, perDay: +(s * TICKS_PER_DAY).toFixed(2), snr: +snr.toFixed(1), to24: v24[k] });
  }
  const adverse = trends.filter((t) => ADVERSE[t.key] * t.perDay > 0).length;
  return {
    ready: true, confidence: adverse >= 2 ? "moderate" : adverse === 1 ? "low" : "none",
    p24: news2(v24, { scale2 }).total, p48: news2(v48, { scale2 }).total, v24, v48, trends,
  };
}

/* ------------------------------------------------------------------ alert gate (hysteresis, de-duplication, silence detection) */

export type Gate = { maxRank: number; calm: number; predAt: number; predP24: number; gapOpen: boolean; last: number[]; suppressed: number };
export const newGate = (): Gate => ({ maxRank: 0, calm: 0, predAt: -999, predP24: 0, gapOpen: false, last: [-999, -999, -999, -999], suppressed: 0 });
export type Raise = { kind: Kind; tier: Tier; score: number; why: string[] };
export const GAP_AFTER = 3; // 90 simulated minutes without a reading
export const CALM_AFTER = 14; // 7 simulated hours strictly below the alerted level before re-arming (stops threshold flapping)

export function gate(g0: Gate, a: Assessment, f: Forecast, t: number, gapTicks: number): { g: Gate; raise: Raise[] } {
  const g = { ...g0, last: [...g0.last] }, raise: Raise[] = [];
  if (gapTicks >= GAP_AFTER) {
    // Silence is a risk, not a "normal" reading. Never score stale data.
    if (!g.gapOpen) {
      g.gapOpen = true;
      raise.push({ kind: "gap", tier: "watch", score: a.total, why: [`No readings for ${dur(gapTicks * STEP_MIN)}. Check the sensor kit and look in on the patient.`] });
    }
    return { g, raise };
  }
  g.gapOpen = false;
  const r = rank(a.tier);
  if (r > g.maxRank) {
    g.maxRank = r; g.calm = 0;
    // Cooldown: the same tier is not re-raised within 24 simulated hours. Critical is never suppressed.
    if (r < 3 && t - g.last[r] < TICKS_PER_DAY) g.suppressed++;
    else { g.last[r] = t; raise.push({ kind: a.baseTier === "stable" ? "signal" : "current", tier: a.tier, score: a.total, why: [a.raised, ...a.reasons.map((x) => x.text)].filter(Boolean) }); }
  } else if (r < g.maxRank) {
    if (++g.calm >= CALM_AFTER) { g.maxRank = r; g.calm = 0; }
  } else g.calm = 0;

  if (f.confidence !== "none" && f.p24 >= 5 && g.maxRank < 2 && (t - g.predAt >= TICKS_PER_DAY || f.p24 >= g.predP24 + 2)) {
    g.predAt = t; g.predP24 = f.p24;
    const drivers = f.trends.filter((x) => ADVERSE[x.key] * x.perDay > 0)
      .map((x) => `${LABEL[x.key]} trending ${x.perDay > 0 ? "up" : "down"} ${Math.abs(x.perDay)} per day, projected ${fmt(x.key, x.to24)} in 24 h`);
    raise.push({ kind: "predicted", tier: f.p24 >= 7 ? "elevated" : "watch", score: a.total,
      why: [`Trend projects NEWS2 ${f.p24} in 24 h and ${f.p48} in 48 h (confidence ${f.confidence}). A projection, not a diagnosis.`, ...drivers] });
  }
  return { g, raise };
}

/* ------------------------------------------------------------------ per-patient state machine (shared by the hub and the tests) */

export type PatState = {
  p: Profile; hist: Reading[]; scores: number[]; baseline: Baseline | null; gate: Gate;
  gapTicks: number; flags: NoteFlags; a: Assessment; f: Forecast;
};
const HIST_CAP = 400;

export function initPat(p: Profile): PatState {
  const r0 = sense(p, 0);
  return { p, hist: [], scores: [], baseline: null, gate: newGate(), gapTicks: 0, flags: NO_FLAGS, f: EMPTY_FORECAST,
    a: assess(r0, { scale2: p.scale2, flags: NO_FLAGS, baseline: null, recent: [] }) };
}

export function stepPatient(s: PatState, t: number, sensorOff: boolean): { s: PatState; r: Reading | null; raise: Raise[] } {
  if (sensorOff) {
    const n = { ...s, gapTicks: s.gapTicks + 1 };
    const { g, raise } = gate(n.gate, n.a, n.f, t, n.gapTicks);
    return { s: { ...n, gate: g }, r: null, raise };
  }
  const r = sense(s.p, t);
  const hist = [...s.hist, r].slice(-HIST_CAP);
  const baseline = s.baseline ?? (hist.length >= LEARN_N ? learnBaseline(hist) : null);
  const a = assess(r, { scale2: s.p.scale2, flags: s.flags, baseline, recent: hist });
  const f = forecast(hist, s.p.scale2);
  const { g, raise } = gate(s.gate, a, f, t, 0);
  return { s: { ...s, hist, scores: [...s.scores, a.total].slice(-HIST_CAP), baseline, a, f, gate: g, gapTicks: 0 }, r, raise };
}

/** Re-score the latest reading after the caregiver note changes. */
export function withNote(s: PatState, text: string): PatState {
  const flags = text ? readNote(text) : NO_FLAGS, last = s.hist[s.hist.length - 1];
  if (!last) return { ...s, flags };
  return { ...s, flags, a: assess(last, { scale2: s.p.scale2, flags, baseline: s.baseline, recent: s.hist }) };
}

/** Whole-scenario helper used by tests and the synthetic dataset generator. */
export function simulate(p: Profile, ticks: number) {
  let s = initPat(p);
  const rows: { t: number; r: Reading; a: Assessment; f: Forecast }[] = [], raises: (Raise & { t: number })[] = [];
  for (let t = 1; t <= ticks; t++) {
    const o = stepPatient(s, t, false); s = o.s;
    if (o.r) rows.push({ t, r: o.r, a: s.a, f: s.f });
    o.raise.forEach((x) => raises.push({ ...x, t }));
  }
  return { rows, raises };
}

/* ------------------------------------------------------------------ roster and escalation */

export const ROSTER = [
  { id: "family", name: "Rohan", role: "Family caregiver", initials: "RO" },
  { id: "nurse", name: "Priya", role: "Visiting nurse", initials: "PR" },
  { id: "doctor", name: "Dr. Mehta", role: "On-call physician", initials: "DM" },
];
/** Demo timer. A real deployment would use 10 to 15 minutes. */
export const ESCALATE_AFTER_S = 20;
export const TOP_LEVEL = ROSTER.length - 1;

/** Early-warning kinds go to the family first. Only a current elevated or critical NEWS2 band goes straight to clinicians. */
export function startLevel(kind: Kind, tier: Tier, duty: boolean[]) {
  const base = kind === "current" ? (tier === "critical" ? 2 : tier === "elevated" ? 1 : 0) : 0;
  return advance(base, duty, 0);
}

export function advance(level: number, duty: boolean[], idleS: number, afterS = ESCALATE_AFTER_S) {
  let l = level, timedOut = false;
  const skipped: number[] = [];
  while (l < TOP_LEVEL && !duty[l]) { skipped.push(l); l++; }
  if (idleS >= afterS && l < TOP_LEVEL) {
    timedOut = true; l++;
    while (l < TOP_LEVEL && !duty[l]) { skipped.push(l); l++; }
  }
  return { level: l, skipped, timedOut };
}
