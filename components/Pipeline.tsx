"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
const STEPS = [
  ["01", "Sense", "A pulse sensor, blood pressure cuff, thermometer and breathing sensor take a reading every half hour. No hardware needed for the demo."],
  ["02", "Understand", "Every reading is scored on a recognised hospital warning chart, then compared with that person's own usual. Notes from family add context, shown separately."],
  ["03", "Predict", "The trend is projected a day and two days ahead, scored again, and the system says how sure it is."],
  ["04", "Alert", "Early signs go to family first. Serious ones go straight to the nurse or doctor. Alerts still reach them if the internet drops."],
  ["05", "Respond", "One tap on a second device acknowledges. Silence climbs the ladder, off-duty people are skipped, and every step is logged."],
];

const C = { ok: "#6adcd1", warn: "#e7b923", hot: "#e98a3d", crit: "#eb605c", line: "#26352f", soft: "#9fb0a8" };
function Viz({ n }: { n: string }) {
  const box = "w-full max-w-md border border-line bg-[#0f1816] p-6";
  if (n === "01") return (<div className={box}>{[["Pulse", "78", "bpm", "M0 20 L20 18 L30 4 L38 30 L48 14 L70 20 L90 19 L100 20"], ["Blood pressure", "124/80", "", "M0 22 L30 20 L60 21 L100 18"], ["Temperature", "36.8", "°C", "M0 18 L40 19 L70 18 L100 17"], ["Breathing", "16", "/min", "M0 20 Q12 6 25 20 T50 20 T75 20 T100 20"]].map(([k, v, u, d]) => (
    <div key={k} className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0"><span className="w-36 text-sm text-mute">{k}</span><svg viewBox="0 0 100 36" className="h-8 flex-1"><path d={d} fill="none" stroke={C.ok} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg><span className="w-20 text-right font-mono text-sm">{v}<span className="text-mute"> {u}</span></span></div>))}</div>);
  if (n === "02") return (<div className={box}><div className="flex items-end justify-between"><div><p className="text-sm text-mute">Today’s score</p><p className="font-display text-7xl" style={{ color: C.warn }}>4</p></div><span className="border px-3 py-1 text-sm" style={{ borderColor: C.warn, color: C.warn }}>▲ Watch</span></div>
    <div className="mt-5 space-y-2 text-sm">{[["Breathing faster than usual", "+1"], ["Oxygen a little low for them", "+2"], ["Pulse within their normal", "0"]].map(([a, b]) => <div key={a} className="flex justify-between border-t border-line pt-2"><span className="text-mute">{a}</span><span className="font-mono">{b}</span></div>)}</div></div>);
  if (n === "03") return (<div className={box}><svg viewBox="0 0 300 130" className="w-full"><line x1="170" y1="6" x2="170" y2="124" stroke={C.line} strokeDasharray="3 4" /><rect x="170" y="6" width="130" height="118" fill="#eb605c" opacity=".07" />
    <path d="M0 98 L30 96 L60 92 L90 88 L120 80 L150 70 L170 62" fill="none" stroke={C.ok} strokeWidth="2" /><path d="M170 62 L230 40 L300 18" fill="none" stroke={C.warn} strokeWidth="2" strokeDasharray="5 5" />
    <text x="12" y="120" fill={C.soft} fontSize="11">Now</text><text x="176" y="120" fill={C.soft} fontSize="11">Next 2 days</text></svg><p className="mt-3 text-sm text-mute">Likely to reach <b className="text-white">Urgent</b> by tomorrow evening</p></div>);
  if (n === "04") return (<div className={box + " space-y-3"}>{[["●", "Stable", "Nobody is bothered", C.ok], ["▲", "Watch", "Family is told", C.warn], ["◆", "Urgent", "Nurse is called", C.hot], ["■", "Emergency", "Doctor and nurse at once", C.crit]].map(([g, l, d, c]) => <div key={l} className="flex items-center gap-4 border px-4 py-3" style={{ borderColor: c + "66" }}><span style={{ color: c }}>{g}</span><span className="w-24 font-semibold" style={{ color: c }}>{l}</span><span className="text-sm text-mute">{d}</span></div>)}</div>);
  return (<div className={box}>{[["Nurse Priya", "No answer", "0:00"], ["Dr. Mehta", "Called next", "2:00"], ["Family", "Told too", "5:00"]].map(([a, b, c], i) => <div key={a} className="flex items-center gap-4 border-b border-line py-3 last:border-0"><span className="grid h-8 w-8 place-items-center border text-sm" style={{ borderColor: C.ok, color: C.ok }}>{i + 1}</span><div className="flex-1"><p className="font-semibold">{a}</p><p className="text-sm text-mute">{b}</p></div><span className="font-mono text-sm text-mute">{c}</span></div>)}</div>);
}
export default function Pipeline() {
  const root = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(min-width:768px) and (prefers-reduced-motion:no-preference)", () => {
      const dist = () => (track.current!.scrollWidth - window.innerWidth);
      gsap.to(track.current, { x: () => -dist(), ease: "none", scrollTrigger: { trigger: root.current, pin: true, scrub: 0.6, end: () => "+=" + dist(), invalidateOnRefresh: true } });
    });
    const r = () => ScrollTrigger.refresh();
    document.fonts.ready.then(r); window.addEventListener("load", r); const t = setTimeout(r, 1200);
    return () => { mm.revert(); window.removeEventListener("load", r); clearTimeout(t); };
  }, []);
  return (
    <section ref={root} className="overflow-hidden border-y border-line md:min-h-[100dvh]">
      <div ref={track} className="flex flex-col md:h-[100dvh] md:w-max md:flex-row">
        {STEPS.map(([n, t, d]) => (
          <article key={n} className="flex flex-col justify-between border-b border-line p-8 md:w-[42vw] md:border-b-0 md:border-r md:p-14">
            <span className="font-mono text-sm text-vital">{n}</span>
            <div className="my-6 flex flex-1 items-center"><Viz n={n} /></div>
            <div><h3 className="font-display text-5xl md:text-7xl">{t}</h3><p className="mt-5 min-h-[8rem] max-w-md text-lg leading-8 text-mute">{d}</p></div>
          </article>))}
      </div>
    </section>);
}
