"use client";
import { cn } from "@/lib/utils";

const Icon = {
  sensor: <path d="M3 12h4l2-6 4 12 2-6h6" fill="none" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />,
  hub: <path d="M4 11l8-7 8 7v9H4zM10 20v-6h4v6" fill="none" strokeWidth={1.8} strokeLinejoin="round" />,
  cloud: <path d="M7 18a4 4 0 010-8 5.5 5.5 0 0110.5 1.2A3.4 3.4 0 0117 18z" fill="none" strokeWidth={1.8} strokeLinejoin="round" />,
  phone: <path d="M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2" fill="none" strokeWidth={1.8} strokeLinecap="round" />,
};
const ROW = 92, BOX = 56, GUT = 44, CX = GUT + BOX / 2, cy = (i: number) => ROW / 2 + i * ROW;
const TEAL = "#6adcd1", AMBER = "#e7b923", ORANGE = "#e98a3d";

/** One hop. Flows while it works, goes amber and dashed and still when it does not. */
function Hop({ from, to, ok, running, delay = 0 }: { from: number; to: number; ok: boolean; running: boolean; delay?: number }) {
  const y1 = cy(from) + BOX / 2 + 2, y2 = cy(to) - BOX / 2 - 2, c = ok ? TEAL : AMBER;
  return (
    <g>
      <line x1={CX} x2={CX} y1={y1} y2={y2} stroke={c} strokeOpacity={ok ? 0.4 : 0.9} strokeWidth={2} strokeDasharray={ok ? undefined : "4 5"} />
      {ok && <line x1={CX} x2={CX} y1={y1} y2={y2} stroke={c} strokeWidth={2.5} strokeLinecap="round" pathLength={100} className="flow" style={{ animationDelay: `${delay}s`, animationPlayState: running ? "running" : "paused" }} />}
      <path d={`M${CX - 5} ${y2 - 7} L${CX} ${y2} L${CX + 5} ${y2 - 7}`} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** The path a reading takes, top to bottom. The orange line on the left is the home network, which keeps working when the internet is cut. */
export function SignalPath({ sensorsOk, sensorsText, linkUp, cloudText, phoneOnline, running }: { sensorsOk: boolean; sensorsText: string; linkUp: boolean; cloudText: string; phoneOnline: boolean; running: boolean }) {
  const rows: { id: keyof typeof Icon; label: string; status: string; ok: boolean }[] = [
    { id: "sensor", label: "Sensors", status: sensorsText, ok: sensorsOk },
    { id: "hub", label: "Home hub", status: "Scoring every reading", ok: true },
    { id: "cloud", label: "Cloud", status: cloudText, ok: linkUp },
    { id: "phone", label: "Caregiver phone", status: phoneOnline ? "Open and listening" : "Not open", ok: phoneOnline },
  ];
  const H = ROW * 4, hubY = cy(1), phY = cy(3);
  return (
    <div>
      <div className="relative" style={{ height: H }}>
        <svg className="pointer-events-none absolute inset-0" width="100%" height={H} aria-hidden>
          <Hop from={0} to={1} ok={sensorsOk} running={running} />
          <Hop from={1} to={2} ok={linkUp} running={running} delay={0.3} />
          <Hop from={2} to={3} ok={linkUp && phoneOnline} running={running} delay={0.6} />
          {/* home network: hub straight to phone, around the left, never touches the internet */}
          <path d={`M${GUT - 2} ${hubY} C ${GUT - 46} ${hubY}, ${GUT - 46} ${phY}, ${GUT - 2} ${phY}`} fill="none" stroke={phoneOnline ? ORANGE : AMBER} strokeOpacity={phoneOnline ? 0.7 : 0.9} strokeWidth={2} strokeDasharray={phoneOnline ? undefined : "4 5"} />
          {phoneOnline && <path d={`M${GUT - 2} ${hubY} C ${GUT - 46} ${hubY}, ${GUT - 46} ${phY}, ${GUT - 2} ${phY}`} fill="none" stroke={ORANGE} strokeWidth={2.5} strokeLinecap="round" pathLength={100} className="flow" style={{ animationDelay: "0.15s", animationPlayState: running ? "running" : "paused" }} />}
          <path d={`M${GUT - 9} ${phY - 5} L${GUT - 2} ${phY} L${GUT - 9} ${phY + 5}`} fill="none" stroke={phoneOnline ? ORANGE : AMBER} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {rows.map((r, i) => (
          <div key={r.id} className="absolute flex items-center gap-4" style={{ left: GUT, right: 0, top: cy(i) - BOX / 2, height: BOX }}>
            <div className={cn("grid shrink-0 place-items-center border bg-care-bg transition-colors duration-500 rd", r.ok ? "border-care-ok text-care-ok" : "border-care-warn text-care-warn")} style={{ width: BOX, height: BOX }}>
              <svg viewBox="0 0 24 24" className="h-7 w-7 stroke-current">{Icon[r.id]}</svg>
            </div>
            <div className="min-w-0"><p className="text-[15px] font-semibold leading-tight">{r.label}</p><p className={cn("mt-0.5 text-[13px] leading-tight", r.ok ? "text-care-soft" : "text-care-warn")}>{r.status}</p></div>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5 border-t border-care-line pt-3 text-[13px] text-care-soft">
        <li className="flex items-center gap-2"><span aria-hidden className="h-0.5 w-5" style={{ background: TEAL }} />Through the internet</li>
        <li className="flex items-center gap-2"><span aria-hidden className="h-0.5 w-5" style={{ background: ORANGE }} />Home network, still works when the internet is cut</li>
      </ul>
    </div>
  );
}
