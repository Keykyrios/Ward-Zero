// Run: npm test   (node:test through tsx; no extra framework)
import test from "node:test";
import assert from "node:assert/strict";
import { news2, tierOfNews2, simulate, PROFILES, advance, startLevel, readNote, learnBaseline, deviations, forecast, sense, rank, type VitalKey, type Reading } from "../lib/engine";

const calm = { rr: 16, spo2: 97, sys: 120, hr: 70, temp: 37.0 };
const pts = (k: VitalKey, v: number, scale2 = false) => news2({ ...calm, [k]: v }, { scale2 }).parts.find((p) => p.key === k)!.pts;

// Every boundary value on the RCP NEWS2 chart (2017). [value, expected points]
const CHART: Record<VitalKey, [number, number][]> = {
  rr: [[8, 3], [9, 1], [11, 1], [12, 0], [20, 0], [21, 2], [24, 2], [25, 3]],
  spo2: [[91, 3], [92, 2], [93, 2], [94, 1], [95, 1], [96, 0], [100, 0]],
  sys: [[90, 3], [91, 2], [100, 2], [101, 1], [110, 1], [111, 0], [219, 0], [220, 3]],
  hr: [[40, 3], [41, 1], [50, 1], [51, 0], [90, 0], [91, 1], [110, 1], [111, 2], [130, 2], [131, 3]],
  temp: [[35.0, 3], [35.1, 1], [36.0, 1], [36.1, 0], [38.0, 0], [38.1, 1], [39.0, 1], [39.1, 2]],
};
for (const k of Object.keys(CHART) as VitalKey[]) {
  test(`NEWS2 chart boundaries: ${k}`, () => { for (const [v, e] of CHART[k]) assert.equal(pts(k, v), e, `${k}=${v}`); });
}
test("NEWS2 SpO2 scale 2 boundaries (on air)", () => {
  for (const [v, e] of [[83, 3], [84, 2], [85, 2], [86, 1], [87, 1], [88, 0], [92, 0], [95, 0]]) assert.equal(pts("spo2", v, true), e, `spo2=${v}`);
});
test("scale 2 does not over-score a COPD patient at 90%", () => {
  assert.equal(pts("spo2", 90, true), 0);
  assert.equal(pts("spo2", 90, false), 3);
});
test("new confusion scores 3 and a single 3 triggers urgent review", () => {
  const n = news2(calm, { scale2: false, confusion: true });
  assert.equal(n.total, 3);
  assert.equal(tierOfNews2(n.total, n.anyRed), "watch");
});
test("risk bands follow the RCP thresholds", () => {
  assert.equal(tierOfNews2(0, false), "stable");
  assert.equal(tierOfNews2(2, false), "stable");
  assert.equal(tierOfNews2(3, false), "watch");
  assert.equal(tierOfNews2(1, true), "watch");
  assert.equal(tierOfNews2(5, false), "elevated");
  assert.equal(tierOfNews2(6, false), "elevated");
  assert.equal(tierOfNews2(7, false), "critical");
});

test("simulator is deterministic", () => { assert.deepEqual(sense(PROFILES[0], 33), sense(PROFILES[0], 33)); });

test("control patient raises nothing in 300 ticks (specificity, alert fatigue)", () => {
  const { raises } = simulate(PROFILES[2], 300);
  assert.deepEqual(raises, []);
});

test("early signals arrive before the NEWS2 elevated band for the declining patient", () => {
  for (const p of [PROFILES[0], PROFILES[1]]) {
    const { raises } = simulate(p, 160);
    const early = raises.find((r) => r.kind === "signal" || r.kind === "predicted");
    const elevated = raises.find((r) => r.kind === "current" && rank(r.tier) >= 2);
    assert.ok(early, `${p.name}: no early signal`);
    assert.ok(elevated, `${p.name}: never reached elevated`);
    assert.ok(early!.t < elevated!.t, `${p.name}: early signal at ${early!.t} should precede elevated at ${elevated!.t}`);
  }
});

test("hysteresis: no patient gets the same tier twice, even when the score hovers on a threshold", () => {
  for (const p of PROFILES) {
    const { raises } = simulate(p, 400);
    const keys = raises.filter((r) => r.kind === "current").map((r) => r.tier);
    assert.equal(new Set(keys).size, keys.length, `${p.name}: ${keys.join(",")}`);
  }
});
test("alert budget: no patient raises more than 7 alerts across 8 simulated days", () => {
  for (const p of PROFILES) assert.ok(simulate(p, 384).raises.length <= 7, p.name);
});

test("baseline needs 3 consecutive harmful readings and ignores benign direction", () => {
  const h: Reading[] = Array.from({ length: 16 }, (_, i) => ({ t: i, rr: 16, spo2: 97, sys: 120, hr: 70, temp: 36.8 }));
  const b = learnBaseline(h);
  const up = (n: number, over: Partial<Reading>): Reading[] => Array.from({ length: n }, (_, i) => ({ ...h[0], t: 16 + i, ...over }));
  assert.equal(deviations(b, up(3, { hr: 100 })).length, 1);
  assert.equal(deviations(b, up(2, { hr: 100 })).length, 0);
  assert.equal(deviations(b, up(3, { hr: 50 })).length, 0); // lower pulse is not flagged by this rule
  assert.equal(deviations(b, up(3, { spo2: 99 })).length, 0); // higher SpO2 is benign
});

test("flat series gives no forecast confidence", () => {
  const flat: Reading[] = Array.from({ length: 24 }, (_, i) => ({ t: i, ...calm }));
  const f = forecast(flat, false);
  assert.equal(f.confidence, "none");
  assert.equal(f.p24, news2(calm, { scale2: false }).total);
});

test("escalation skips off-duty caregivers and climbs on timeout", () => {
  assert.deepEqual(advance(0, [false, true, true], 0), { level: 1, skipped: [0], timedOut: false });
  assert.deepEqual(advance(0, [true, true, true], 25), { level: 1, skipped: [], timedOut: true });
  assert.deepEqual(advance(0, [true, false, true], 25), { level: 2, skipped: [1], timedOut: true });
  assert.equal(advance(2, [true, true, true], 999).level, 2);
});
test("routing: early warnings go to family, critical goes to the physician", () => {
  assert.equal(startLevel("predicted", "elevated", [true, true, true]).level, 0);
  assert.equal(startLevel("current", "elevated", [true, true, true]).level, 1);
  assert.equal(startLevel("current", "critical", [true, true, true]).level, 2);
  assert.equal(startLevel("gap", "watch", [false, true, true]).level, 1);
});

test("note reader flags confusion, symptoms and infection signs", () => {
  assert.equal(readNote("seems confused this morning").confusion, true);
  assert.equal(readNote("a bit breathless on the stairs").symptom, true);
  assert.equal(readNote("wound looks red and swollen").infection, true);
  assert.equal(readNote("tired but cheerful").infection, false); // 'tired' must not match 'red'
});

import { scoreScan } from "../lib/ward";
import { briefIsGrounded } from "../lib/guard";
import { initPat } from "../lib/engine";
test("photographed reading: missing vitals fall back to the latest reading, then score with NEWS2", () => {
  const P = initPat(PROFILES[2]);
  const r = scoreScan(P, { rr: 28, spo2: 90, sys: null, hr: null, temp: null });
  assert.equal(r.v.sys, 120);
  assert.ok(r.n.total >= 5, `score ${r.n.total}`);
  assert.equal(r.tier === "elevated" || r.tier === "critical", true);
});
test("brief guard rejects invented numbers and treatment language, accepts grounded text", () => {
  const facts = { now: { rr: 22, spo2: 94 }, news2: 3, forecast: { in24h: 5 } };
  const ok = { family: "Breathing is 22 a minute and the score is 3.", sbar: { situation: "s", background: "b", assessment: "SpO2 94", recommendation: "Look in on them." }, model: "m" };
  assert.equal(briefIsGrounded(ok, facts), true);
  assert.equal(briefIsGrounded({ ...ok, family: "Breathing is 31 a minute." }, facts), false);
  assert.equal(briefIsGrounded({ ...ok, sbar: { ...ok.sbar, recommendation: "Give 5 mg of the antibiotic." } }, facts), false);
});
