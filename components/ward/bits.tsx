"use client";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/engine";

export const TIER_TXT: Record<Tier, string> = { stable: "text-vital", watch: "text-warn", elevated: "text-crit", critical: "text-crit" };
const GLYPH: Record<Tier, string> = { stable: "●", watch: "▲", elevated: "◆", critical: "■" };

/** Colour is never the only signal: every tier also carries a shape and a word. */
export function TierBadge({ tier, label, className }: { tier: Tier; label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider",
      tier === "stable" && "border-vital/50 text-vital", tier === "watch" && "border-warn/60 text-warn",
      tier === "elevated" && "border-crit text-crit", tier === "critical" && "border-crit bg-crit text-ink", className)}>
      <span aria-hidden>{GLYPH[tier]}</span>{label ?? tier}
    </span>
  );
}

type TraceProps = { ys: number[]; w?: number; h?: number; band?: [number, number]; tone?: string; dom?: [number, number]; label?: string };
export function Trace({ ys, w = 120, h = 34, band, tone = "stroke-bone", dom, label }: TraceProps) {
  if (ys.length < 2) return <svg width={w} height={h} role="img" aria-label={label ?? "No data yet"} />;
  const lo = dom ? dom[0] : Math.min(...ys, band ? band[0] : Infinity), hi = dom ? dom[1] : Math.max(...ys, band ? band[1] : -Infinity);
  const pad = (hi - lo || 1) * 0.12, a = lo - pad, b = hi + pad;
  const y = (v: number) => h - ((v - a) / (b - a)) * h;
  const d = ys.map((v, i) => `${i ? "L" : "M"}${((i / (ys.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width={w} height={h} className="overflow-visible" role="img" aria-label={label}>
      {band && <rect x={0} width={w} y={Math.max(0, y(Math.min(band[1], b)))} height={Math.max(0, Math.min(h, y(Math.max(band[0], a))) - Math.max(0, y(Math.min(band[1], b))))} className="fill-vital/10" />}
      <path d={d} fill="none" strokeWidth={1.5} className={tone} />
      <circle cx={w} cy={y(ys[ys.length - 1])} r={2.5} className={cn("fill-current", tone.replace("stroke-", "text-"))} />
    </svg>
  );
}
