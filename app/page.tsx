import Link from "next/link";
import Hero from "@/components/Hero";
import Board from "@/components/Board";
import Journey, { type JEvent } from "@/components/Journey";
import VelocityMarquee from "@/components/VelocityMarquee";
import ScrollBar from "@/components/ScrollBar";
import Pipeline from "@/components/Pipeline";
import { PROFILES, simulate, rank, clock, dur } from "@/lib/engine";

// Computed at build time from the same engine the ward screen runs. Nothing here is typed in by hand.
const rows = PROFILES.map((p) => {
  const { raises } = simulate(p, 200);
  const early = raises.find((r) => r.kind === "signal" || r.kind === "predicted"), hi = raises.find((r) => r.kind === "current" && rank(r.tier) >= 2);
  return { label: p.name.toUpperCase(), value: early && hi ? `${((hi.t - early.t) / 2).toFixed(1)}H LEAD` : early ? "EARLY ONLY" : "NO ALERTS" };
});

// Asha Rao's decline, straight from the engine.
const asha = simulate(PROFILES[0], 200);
const KIND: Record<string, string> = { predicted: "Forecast", signal: "Early signal", current: "Score alert", gap: "Data gap" };
const events: JEvent[] = asha.raises.map((r) => ({
  t: r.t, tier: r.tier, clock: clock(r.t),
  label: r.kind === "current" ? `${KIND.current}: ${r.tier}` : KIND[r.kind],
  text: r.why[0].replace(/^Trend projects/, "The trend projects").slice(0, 150),
}));
const firstEarly = asha.raises.find((r) => r.kind === "signal" || r.kind === "predicted"), firstHigh = asha.raises.find((r) => r.kind === "current" && rank(r.tier) >= 2);
const lead = firstEarly && firstHigh ? dur((firstHigh.t - firstEarly.t) * 30) : "hours";

export default function Home() {
  return (
    <main className="bg-ink text-bone">
      <ScrollBar />
      <Hero />
      <div className="border-y border-line"><VelocityMarquee text="Sense, understand, predict, alert, respond." /></div>
      <div id="pipeline"><Pipeline /></div>
      <Board rows={rows} />
      <Journey scores={asha.rows.map((x) => x.a.total)} events={events} lead={lead} name={PROFILES[0].name} />
      <section className="border-t border-line px-6 py-32 md:px-14">
        <h2 className="max-w-5xl font-display text-5xl md:text-7xl">Cut the cable. Watch it hold.</h2>
        <div className="mt-10"><Link href="/ward" className="inline-block bg-vital px-7 py-4 font-medium text-ink">Open the ward</Link></div>
        <p className="mt-20 max-w-2xl text-xs leading-6 text-mute">Demonstration with synthetic data. The scoring chart used, NEWS2, is a published early warning score from the Royal College of Physicians; this software is not a medical device, is not clinically validated, and does not replace professional care or emergency services.</p>
      </section>
    </main>
  );
}
