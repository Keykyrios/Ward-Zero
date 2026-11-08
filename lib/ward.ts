import { ROSTER, news2, tierOfNews2, type Kind, type Tier, type PatState } from "./engine";
export type Alert = {
  id: string; pid: string; name: string; tier: Tier; kind: Kind; score: number; why: string[]; t: number;
  level: number; created: number; levelSince: number; escalations: number; ackBy?: string; ackAt?: number; ackVia?: string;
};
export type LogRow = { id: number; at: number; t: number; tone: "info" | "ok" | "warn" | "crit"; text: string };
export const ROOM = "demo-room";
export const KIND_LABEL: Record<Kind, string> = { current: "Current score", predicted: "Forecast", signal: "Early signal", gap: "Data gap" };
export const assignee = (a: Alert) => ROSTER[a.level];
export const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

/** First action for the caregiver. Deliberately modest: look, re-check, call. Never a diagnosis or a treatment. */
export const NEXT_STEP: Record<Kind, string> = {
  current: "Go to them now. If they look very unwell, call emergency services.",
  predicted: "Look in on them within a few hours. Check their breathing, temperature and how alert they are.",
  signal: "Take their readings again and note how they look and feel.",
  gap: "Check the sensor kit is on and charged, then look in on them.",
};

/** Display wording: drop the clinical acronym and any doubled full stop. */
export const plain = (t: string) => t.replace(/NEWS2 /g, "score ").replace(/\.+$/, "");

export type ScanVitals = { rr: number | null; spo2: number | null; sys: number | null; hr: number | null; temp: number | null };
/** A photographed reading may miss some vitals. Missing ones fall back to the patient's latest reading, then to a neutral value. */
export function scoreScan(P: PatState, sc: ScanVitals) {
  const last = P.hist[P.hist.length - 1];
  const v = { rr: sc.rr ?? last?.rr ?? 16, spo2: sc.spo2 ?? last?.spo2 ?? 97, sys: sc.sys ?? last?.sys ?? 120, hr: sc.hr ?? last?.hr ?? 70, temp: sc.temp ?? last?.temp ?? 37 };
  const n = news2(v, { scale2: P.p.scale2, confusion: P.flags.confusion });
  return { v, n, tier: tierOfNews2(n.total, n.anyRed) };
}
