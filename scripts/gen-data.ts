// Generates the synthetic dataset in data/synthetic. Run: npm run gen:data
import { mkdirSync, writeFileSync } from "node:fs";
import { PROFILES, simulate, clock } from "../lib/engine";

mkdirSync("data/synthetic", { recursive: true });
const head = "patient_id,tick,sim_time,rr,spo2,sys,hr,temp,news2,tier,forecast_p24,forecast_p48,forecast_confidence";
for (const p of PROFILES) {
  const { rows, raises } = simulate(p, 200);
  const lines = rows.map(({ t, r, a, f }) =>
    [p.id, t, `"${clock(t)}"`, r.rr, r.spo2, r.sys, r.hr, r.temp.toFixed(1), a.total, a.tier, f.ready ? f.p24 : "", f.ready ? f.p48 : "", f.confidence].join(","));
  writeFileSync(`data/synthetic/${p.id}.csv`, [head, ...lines].join("\n") + "\n");
  console.log(p.name.padEnd(12), "alerts:", raises.map((x) => `${x.kind}/${x.tier}@t${x.t}`).join("  ") || "none");
}
