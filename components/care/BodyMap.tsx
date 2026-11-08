"use client";
import type { Reading, VitalKey } from "@/lib/engine";
import { cn } from "@/lib/utils";

const P: Record<VitalKey, { x: number; y: number; side: "l" | "r"; name: string; unit: string }> = {
  temp: { x: 230, y: 52, side: "r", name: "Temperature", unit: "°C" },
  rr: { x: 230, y: 150, side: "r", name: "Breathing", unit: "per min" },
  spo2: { x: 306, y: 262, side: "r", name: "Oxygen", unit: "%" },
  sys: { x: 160, y: 165, side: "l", name: "Blood pressure", unit: "mmHg" },
  hr: { x: 154, y: 252, side: "l", name: "Pulse", unit: "bpm" },
};
const TONE = ["#6adcd1", "#e7b923", "#e98a3d", "#eb605c"];

/** Where each reading comes from on the body. A ring pulses from any sensor that is out of range. */
export function BodyMap({ v, pts, silent }: { v: Reading; pts: Record<string, number>; silent: boolean }) {
  return (
    <svg viewBox="0 0 460 480" className="mx-auto w-full max-w-[420px]" role="img" aria-label="Body map showing where each vital sign is measured">
      <g fill="rgba(22,34,31,.6)" stroke="#26352f" strokeWidth={2} strokeLinejoin="round">
        <circle cx={230} cy={58} r={34} />
        <path d="M190 100 Q230 90 270 100 L306 120 L322 258 L300 262 L286 170 L280 310 L276 456 L238 456 L230 330 L222 456 L184 456 L180 310 L174 170 L160 262 L138 258 L154 120 Z" />
      </g>
      <g fill="none" stroke="#26352f" strokeWidth={1.5}>
        <path d="M205 140 Q188 150 196 188 M255 140 Q272 150 264 188" />
      </g>
      {(Object.keys(P) as VitalKey[]).map((k) => {
        const m = P[k], pt = pts[k] ?? 0, c = silent ? "#9fb0a8" : TONE[pt], lx = m.side === "l" ? 20 : 440, anchor = m.side === "l" ? "start" : "end";
        return (
          <g key={k}>
            <line x1={m.x} y1={m.y} x2={m.side === "l" ? 128 : 332} y2={m.y} stroke={c} strokeOpacity={0.5} strokeDasharray="2 4" />
            <line x1={m.side === "l" ? 128 : 332} y1={m.y} x2={m.side === "l" ? lx + 124 : lx - 124} y2={m.y} stroke={c} strokeOpacity={0.5} />
            <circle cx={m.x} cy={m.y} r={5} fill={c} />
            {!silent && <circle cx={m.x} cy={m.y} r={5} fill="none" stroke={c} strokeWidth={2} className={cn("ripple", pt === 0 && "ripple-calm")} style={{ transformOrigin: `${m.x}px ${m.y}px` }} />}
            <text x={lx} y={m.y - 30} textAnchor={anchor} className="fill-care-soft" fontSize={17}>{m.name}</text>
            <text x={lx} y={m.y + 4} textAnchor={anchor} className="fill-care-text" fontSize={32} fontWeight={600} style={{ fontVariantNumeric: "tabular-nums" }}>{silent ? "no data" : k === "temp" ? v[k].toFixed(1) : v[k]}<tspan fontSize={15} fontWeight={400} className="fill-care-soft"> {silent ? "" : m.unit}</tspan></text>
          </g>
        );
      })}
    </svg>
  );
}
