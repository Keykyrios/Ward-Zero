"use client";
import { useRef } from "react";
import { motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import { useState } from "react";

export type JEvent = { t: number; clock: string; label: string; text: string; tier: string };
type Props = { scores: number[]; events: JEvent[]; lead: string; name: string };
const W = 1200, H = 340, MAXV = 12;

/** One real simulated decline, drawn by the scroll position. Every point and event comes from the same engine that runs the ward. */
export default function Journey({ scores, events, lead, name }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: box, offset: ["start 0.85", "end 0.55"] });
  const p = useSpring(scrollYProgress, { stiffness: 90, damping: 28 });
  const n = scores.length, X = (i: number) => (i / (n - 1)) * W, Y = (v: number) => H - (Math.min(v, MAXV) / MAXV) * H;
  const d = scores.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const [prog, setProg] = useState(0);
  useMotionValueEvent(p, "change", (v) => setProg(v));
  const draw = useTransform(p, [0, 1], [0, 1]);
  return (
    <section className="border-t border-line px-6 py-28 md:px-14">
      <h2 className="max-w-4xl font-display text-5xl md:text-7xl">One decline, hour by hour.</h2>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-mute">{name}'s simulated flare, from the same engine that runs the ward. For the first day the score barely moves. The trend does not wait, and neither does the first alert: {lead} before the chart reaches the urgent band.</p>
      <div ref={box} className="mt-16">
        <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full" role="img" aria-label={`${name}'s NEWS2 score over ${n} readings with ${events.length} alert events`}>
          {[[3, "3"], [5, "5 urgent"], [7, "7 emergency"]].map(([v, l]) => (
            <g key={l}><line x1={0} x2={W} y1={Y(+v)} y2={Y(+v)} className={+v >= 7 ? "stroke-crit/40" : +v >= 5 ? "stroke-ember/40" : "stroke-warn/30"} strokeDasharray="3 6" />
              <text x={4} y={Y(+v) - 6} className="fill-mute font-mono" fontSize={13}>{l}</text></g>
          ))}
          <motion.path d={d} fill="none" strokeWidth={2.5} className="stroke-bone" style={{ pathLength: draw }} />
          {events.map((e, k) => {
            const i = Math.min(e.t - 1, n - 1), on = prog >= i / (n - 1) - 0.01, x = X(i), y = Y(scores[i] ?? 0);
            return (
              <g key={k} style={{ opacity: on ? 1 : 0.15, transition: "opacity .4s" }}>
                <line x1={x} x2={x} y1={y} y2={H + 4} className={e.tier === "critical" || e.tier === "elevated" ? "stroke-crit/60" : "stroke-warn/60"} />
                <circle cx={x} cy={y} r={7} className={e.tier === "critical" || e.tier === "elevated" ? "fill-crit" : "fill-warn"} />
                <text x={x} y={H + 24} textAnchor="middle" className="fill-ink font-mono" fontSize={12} fontWeight={600}><tspan className="fill-bone">{k + 1}</tspan></text>
              </g>
            );
          })}
        </svg>
        <ol className="mt-12 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {events.map((e, k) => (
            <li key={k} className="bg-ink p-7">
              <div className="flex items-baseline gap-3"><span className="font-mono text-sm text-vital">{k + 1}</span><span className="font-mono text-xs text-mute">{e.clock}</span></div>
              <h3 className="mt-4 font-display text-2xl leading-tight">{e.label}</h3>
              <p className="mt-3 text-[15px] leading-7 text-mute">{e.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
