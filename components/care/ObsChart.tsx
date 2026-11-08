"use client";
import { useEffect, useRef } from "react";
import { VITALS, news2, clock, type Reading, type VitalKey } from "@/lib/engine";
import { cn } from "@/lib/utils";

const NAME: Record<VitalKey, [string, string]> = { rr: ["Breathing", "per minute"], spo2: ["Oxygen", "%"], sys: ["Blood pressure", "top number"], hr: ["Pulse", "beats per minute"], temp: ["Temperature", "°C"] };
const SHADE = ["", "bg-care-warnBg", "bg-care-hotBg", "bg-care-critBg"];
type Col = { gap: number } | { r: Reading; pts: Record<string, number>; total: number };

/** The paper observation chart nurses already know: one column per reading, a cell is tinted when it scores. */
export function ObsChart({ hist, scale2 }: { hist: Reading[]; scale2: boolean }) {
  const box = useRef<HTMLDivElement>(null), win = hist.slice(-12), cols: Col[] = [];
  win.forEach((r, i) => {
    const prev = win[i - 1];
    if (prev && r.t - prev.t > 1) cols.push({ gap: r.t - prev.t - 1 });
    const n = news2(r, { scale2 });
    cols.push({ r, pts: Object.fromEntries(n.parts.map((p) => [p.key, p.pts])), total: n.total });
  });
  useEffect(() => { const el = box.current; if (el) el.scrollLeft = el.scrollWidth; }, [hist.length]);
  if (!win.length) return <p className="text-care-soft">The chart fills in as readings arrive.</p>;
  return (
    <div ref={box} className="overflow-x-auto" tabIndex={0} aria-label="Observation chart, scrolls sideways">
      <table className="w-full min-w-max border-collapse text-[14px] num">
        <thead><tr><th className="sticky left-0 z-10 w-36 bg-care-bg" />{cols.map((c, i) => <th key={i} className="h-10 min-w-[52px] border-b border-care-line px-1 text-center text-xs font-normal text-care-soft">{"r" in c ? clock(c.r.t).split(", ")[1] : ""}</th>)}</tr></thead>
        <tbody>
          {VITALS.map((k) => (
            <tr key={k}>
              <th scope="row" className="sticky left-0 z-10 border-b border-care-line bg-care-bg py-3 pr-4 text-left font-normal"><div>{NAME[k][0]}</div><div className="text-sm text-care-soft">{NAME[k][1]}</div></th>
              {cols.map((c, i) => "r" in c
                ? <td key={c.r.t} className={cn("h-12 border-b border-l border-care-line text-center", SHADE[c.pts[k]], i === cols.length - 1 && "col-in", i === cols.length - 1 && c.pts[k] > 0 && "flash text-care-warn")}>{k === "temp" ? c.r[k].toFixed(1) : c.r[k]}</td>
                : <td key={i} className="h-12 border-b border-l border-care-line bg-care-band text-center text-xs text-care-soft">{k === "rr" ? "no data" : ""}</td>)}
            </tr>
          ))}
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-care-bg py-3 pr-4 text-left font-semibold">Score</th>
            {cols.map((c, i) => "r" in c
              ? <td key={c.r.t} className={cn("h-12 border-l border-t-2 border-care-line border-t-care-text text-center text-lg font-semibold", c.total >= 7 ? "bg-care-crit text-care-onBrand" : c.total >= 5 ? "bg-care-hotBg text-care-hot" : c.total >= 3 ? "bg-care-warnBg text-care-warn" : "")}>{c.total}</td>
              : <td key={i} className="h-12 border-l border-t-2 border-care-line border-t-care-text bg-care-band" />)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
