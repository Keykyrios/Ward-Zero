import { news2, describeFlags, type PatState, type Tier } from "./engine";
import type { Alert } from "./ward";
import { briefIsGrounded } from "./guard";

export type Brief = { family: string; sbar: { situation: string; background: string; assessment: string; recommendation: string }; model: string };

const REC: Record<Tier, string> = {
  stable: "Routine monitoring. Look in on them as usual.",
  watch: "Re-check their readings and ask a clinician to take an urgent look.",
  elevated: "Contact their clinician now and stay with them.",
  critical: "Call emergency services now. Stay with them.",
};

/** Only facts the engine already computed. The language model may reword them, never add to them. */
export function facts(P: PatState, alerts: Alert[]) {
  const last = P.hist[P.hist.length - 1];
  return {
    patient: { name: P.p.name, age: P.p.age, condition: P.p.cond },
    now: last ? { rr: last.rr, spo2: last.spo2, systolic: last.sys, pulse: last.hr, temp: last.temp } : null,
    news2: P.a.total, tier: P.a.tier, reasons: P.a.reasons.map((r) => r.text),
    forecast: P.f.ready && P.f.confidence !== "none" ? { in24h: P.f.p24, in48h: P.f.p48, confidence: P.f.confidence } : null,
    noteReadAs: describeFlags(P.flags), recentAlerts: alerts.filter((a) => a.pid === P.p.id).slice(0, 4).map((a) => `${a.kind}/${a.tier}${a.ackBy ? `, acknowledged by ${a.ackBy}` : ", unacknowledged"}`),
  };
}

export function fallbackBrief(P: PatState, alerts: Alert[]): Brief {
  const f = facts(P, alerts), n = f.now;
  return {
    family: `${P.p.name} is ${P.a.tier} (NEWS2 ${P.a.total}). ${P.a.reasons[0]?.text ?? "Every vital is in its normal range."} ${REC[P.a.tier]}`,
    sbar: {
      situation: `${P.p.name}, ${P.p.age}, NEWS2 ${P.a.total} (${P.a.tier}).`,
      background: P.p.cond,
      assessment: [n ? `RR ${n.rr}, SpO2 ${n.spo2}%, SBP ${n.systolic}, HR ${n.pulse}, temp ${n.temp}.` : "No readings yet.", ...f.reasons.slice(0, 3)].join(" "),
      recommendation: REC[P.a.tier],
    },
    model: "template (no language model used)",
  };
}

export async function writeBrief(P: PatState, alerts: Alert[]): Promise<Brief> {
  try {
    const f = facts(P, alerts);
    const r = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json();
    if (!r.ok || !j.family || !j.sbar) throw new Error(j.error || "bad reply");
    if (!briefIsGrounded(j as Brief, f)) throw new Error("model added content that was not in the facts");
    return j as Brief;
  } catch {
    return fallbackBrief(P, alerts);
  }
}

export { news2 };
