"use client";
import { useEffect, useRef } from "react";
import { motion, useSpring, useMotionValueEvent, useInView } from "motion/react";
import { cn } from "@/lib/utils";

/** Fade and rise once when scrolled into view. Transform and opacity only, so it stays on the compositor. */
export function Reveal({ children, className, delay = 0, y = 28 }: { children: React.ReactNode; className?: string; delay?: number; y?: number }) {
  return <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -8% 0px" }} transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}>{children}</motion.div>;
}

/** A number that glides to its new value with a spring. It writes straight to the DOM, so React never re-renders for it. */
export function Glide({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null), sp = useSpring(value, { stiffness: 90, damping: 18, mass: 0.8 });
  useEffect(() => { sp.set(value); }, [value, sp]);
  useMotionValueEvent(sp, "change", (v) => { if (el.current) el.current.textContent = v.toFixed(decimals); });
  return <span ref={el} className={cn("num", className)}>{value.toFixed(decimals)}</span>;
}

/** The monitor trace. One beat is drawn as a path, the strip scrolls with a CSS animation, and the beat rate follows the pulse. */
export function Ecg({ bpm, className, tone = "stroke-care-ok", paused }: { bpm: number; className?: string; tone?: string; paused?: boolean }) {
  const rate = Math.round(Math.max(45, Math.min(150, bpm)) / 5) * 5, beat = "M0 30 H46 L52 30 L57 22 L63 30 H80 L85 35 L91 3 L97 52 L102 30 H120 L129 22 L138 30 H160";
  const row = Array.from({ length: 10 }, (_, i) => <path key={i} d={beat} transform={`translate(${i * 160} 0)`} />);
  return (
    // Edge fade is two gradient caps, not a CSS mask: a mask on a moving layer is re-rendered every frame.
    <div className={cn("relative overflow-hidden [contain:paint]", className)} aria-hidden>
      <div className="ecg-strip flex w-[3200px]" style={{ ["--d" as string]: `${(60 / rate) * 10}s`, animationPlayState: paused ? "paused" : "running" }}>
        {[0, 1].map((k) => <svg key={k} width={1600} height={60} viewBox="0 0 1600 60" className="shrink-0 overflow-visible"><g fill="none" strokeWidth={2} strokeLinejoin="round" className={tone}>{row}</g></svg>)}
      </div>
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[12%] bg-gradient-to-r from-[#0f1816] to-transparent" />
      <span className="pointer-events-none absolute inset-y-0 right-0 w-[12%] bg-gradient-to-l from-[#0f1816] to-transparent" />
    </div>
  );
}

/** Cursor-following light on a surface. Pure CSS variables; no state, no re-render. */
export function Spot({ children, className, as: T = "div", ...rest }: { children: React.ReactNode; className?: string; as?: React.ElementType } & Record<string, unknown>) {
  return (
    <T {...rest} className={cn("spot relative overflow-hidden", className)}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`); e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`); }}>
      {children}
    </T>
  );
}

/** Segmented score ring: 270 degrees, four bands, a marker that springs to the score. */
export function Ring({ score, tone }: { score: number; tone: string }) {
  const R = 104, C = 2 * Math.PI * R, arc = C * 0.75, max = 10, f = Math.min(score, max) / max;
  const sp = useSpring(0, { stiffness: 70, damping: 16 }), ref = useRef<SVGCircleElement>(null), seen = useRef(null), inView = useInView(seen, { once: true });
  useEffect(() => { sp.set(inView ? f : 0); }, [f, inView, sp]);
  useMotionValueEvent(sp, "change", (v) => { if (ref.current) ref.current.style.strokeDashoffset = String(arc - arc * v); });
  const tick = (v: number) => { const a = (135 + (v / max) * 270) * (Math.PI / 180); return [130 + Math.cos(a) * (R + 16), 130 + Math.sin(a) * (R + 16), 130 + Math.cos(a) * (R - 16), 130 + Math.sin(a) * (R - 16)]; };
  return (
    <div ref={seen} className="relative mx-auto h-[260px] w-[260px]">
      <svg viewBox="0 0 260 260" className="absolute inset-0 -rotate-[225deg]" aria-hidden>
        <circle cx={130} cy={130} r={R} fill="none" strokeWidth={14} strokeDasharray={`${arc} ${C}`} className="stroke-care-line" />
        <circle ref={ref} cx={130} cy={130} r={R} fill="none" strokeWidth={14} strokeDasharray={`${arc} ${C}`} strokeDashoffset={arc} strokeLinecap="butt" className={cn("transition-[stroke] duration-700", tone)} />
      </svg>
      <svg viewBox="0 0 260 260" className="absolute inset-0" aria-hidden>{[3, 5, 7].map((v) => { const [x1, y1, x2, y2] = tick(v); return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-care-bg" strokeWidth={3} />; })}</svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><div className={cn("font-display text-[88px] leading-none", tone.replace("stroke-", "text-"))}><Glide value={score} /></div><div className="mt-1 text-sm text-care-soft">early warning score</div></div></div>
    </div>
  );
}

/** Last readings of one vital as a line with a live head. */
export function Spark({ ys, w = 120, h = 32, tone = "stroke-care-soft", minSpan = 0 }: { ys: number[]; w?: number; h?: number; tone?: string; minSpan?: number }) {
  if (ys.length < 2) return <svg width={w} height={h} aria-hidden />;
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2, half = Math.max((Math.max(...ys) - Math.min(...ys)) / 2, minSpan / 2), lo = mid - half, hi = mid + half, pad = (hi - lo || 1) * 0.15, a = lo - pad, b = hi + pad, y = (v: number) => h - ((v - a) / (b - a)) * h;
  const d = ys.map((v, i) => `${i ? "L" : "M"}${((i / (ys.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return <svg width={w} height={h} className="overflow-visible" aria-hidden><path d={d} fill="none" strokeWidth={1.6} className={tone} /><circle cx={w} cy={y(ys[ys.length - 1])} r={3} className={cn("fill-current", tone.replace("stroke-", "text-"))} /></svg>;
}

/** A soft shape that swells and settles at the patient's own breathing rate. Quiet, and it carries a real number. */
export function BreathingOrb({ rr, tone, paused }: { rr: number; tone: string; paused?: boolean }) {
  const rate = Math.round(Math.max(8, Math.min(34, rr))), d = 60 / rate;
  return (
    <div aria-hidden className="pointer-events-none absolute -right-20 top-6 hidden h-[560px] w-[560px] md:block">
      {[1, 0.74, 0.5].map((k, i) => (
        <div key={i} className="breathe absolute inset-0 m-auto rounded-full" style={{ width: `${k * 100}%`, height: `${k * 100}%`, background: `radial-gradient(circle, ${tone}${i === 2 ? "38" : i === 1 ? "22" : "12"} 0%, transparent 68%)`, border: `1px solid ${tone}22`, animationDuration: `${d}s`, animationDelay: `${i * 0.12}s`, animationPlayState: paused ? "paused" : "running", transition: "background .8s" }} />
      ))}
    </div>
  );
}
