"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export type Tab = "overview" | "readings" | "handover" | "team";
type Mood = "idle" | "talk" | "happy";
type Step = { tab: Tab; target: string; title: string; text: string };

/** Pip. Round, mint, a heart on its antenna. Eyes blink, body bobs, mouth moves while it talks. */
export function Pip({ mood = "idle", className, point }: { mood?: Mood; className?: string; point?: boolean }) {
  return (
    <svg viewBox="0 0 120 124" className={cn("pip", className)} aria-hidden>
      <defs>
        <radialGradient id="pipBody" cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#a6f5ec" /><stop offset="1" stopColor="#4cc9be" /></radialGradient>
      </defs>
      <ellipse cx="60" cy="116" rx="30" ry="5" fill="#000" opacity=".25" />
      <g className="pip-bob">
        {/* antenna with a little heart that beats */}
        <path d="M60 26 C60 18 59 14 60 11" stroke="#4cc9be" strokeWidth="3" strokeLinecap="round" fill="none" />
        <g className="pip-heart"><path d="M60 13 C52 7 50 -1 56 -2 C58 -2.4 60 -0.5 60 1 C60 -0.5 62 -2.4 64 -2 C70 -1 68 7 60 13 Z" fill="#ff8aa1" transform="translate(0 4)" /></g>
        {/* feet and arms */}
        <ellipse cx="44" cy="106" rx="11" ry="6" fill="#3fb5aa" /><ellipse cx="76" cy="106" rx="11" ry="6" fill="#3fb5aa" />
        <ellipse cx="21" cy="76" rx="8" ry="11" fill="#4cc9be" transform="rotate(18 21 76)" />
        <g className={point ? "pip-point" : undefined} style={{ transformOrigin: "98px 70px" }}><ellipse cx="99" cy="76" rx="8" ry="11" fill="#4cc9be" transform="rotate(-18 99 76)" /></g>
        {/* body */}
        <ellipse cx="60" cy="68" rx="41" ry="39" fill="url(#pipBody)" />
        <ellipse cx="60" cy="82" rx="22" ry="17" fill="#e4fffb" opacity=".6" />
        <path d="M46 82h6l3-7 5 13 4-9 2 3h8" fill="none" stroke="#3fb5aa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {/* face */}
        {mood === "happy" ? (
          <g stroke="#0a1110" strokeWidth="3.2" strokeLinecap="round" fill="none"><path d="M39 63 Q46 54 53 63" /><path d="M67 63 Q74 54 81 63" /></g>
        ) : (
          <g className="pip-eyes" fill="#0a1110"><ellipse cx="46" cy="62" rx="6.2" ry="8.2" /><ellipse cx="74" cy="62" rx="6.2" ry="8.2" /><circle cx="48.4" cy="58.6" r="2.3" fill="#fff" /><circle cx="76.4" cy="58.6" r="2.3" fill="#fff" /></g>
        )}
        <ellipse cx="34" cy="74" rx="6" ry="3.6" fill="#ff9fb1" opacity=".6" /><ellipse cx="86" cy="74" rx="6" ry="3.6" fill="#ff9fb1" opacity=".6" />
        {mood === "talk" ? <g className="pip-mouth"><path d="M53 72 Q60 87 67 72 Z" fill="#0a1110" /><path d="M56.5 80 Q60 84.5 63.5 80 Q60 78 56.5 80Z" fill="#ff8aa1" /></g>
          : <path d="M52 73 Q60 82 68 73" stroke="#0a1110" strokeWidth="2.8" strokeLinecap="round" fill="none" />}
      </g>
    </svg>
  );
}

const TOURS: Record<string, { label: string; steps: Step[] }> = {
  all: { label: "Show me around", steps: [
    { tab: "overview", target: "patients", title: "The people being watched", text: "Tap a name to look at that person. The number is their warning score: 0 means calm, higher means look closer." },
    { tab: "overview", target: "controls", title: "Make something go wrong", text: "Skip ahead in time, cut the internet or switch off a sensor. Watch what the ward does about it." },
    { tab: "overview", target: "tiles", title: "Five vital signs", text: "Each shows today's reading next to what is usual for them. A box only turns amber or red when something is out of range." },
    { tab: "overview", target: "why", title: "Why this score", text: "No black box. Every point is explained in plain words, and the full working is one tap away." },
    { tab: "overview", target: "forecast", title: "Where this is heading", text: "A look at the next two days, so someone can act before it gets serious." },
    { tab: "overview", target: "rail", title: "How an alert gets to a person", text: "From the sensors to the hub to the phone. The orange line is the home network, which keeps working without internet." },
    { tab: "readings", target: "chart", title: "Recent readings", text: "Every reading as it came in. Tinted boxes are out of range. Grey stripes mean the sensor sent nothing." },
    { tab: "handover", target: "summary", title: "The AI summary", text: "Press the button and an AI writes a short summary for the family and the next nurse. It is checked against the real numbers, so it cannot make any up." },
    { tab: "handover", target: "pdf", title: "Take it with you", text: "Download a one page PDF of the same summary to print or hand over." },
    { tab: "handover", target: "scan", title: "AI vision", text: "No sensor? Take a photo of a pulse oximeter, blood pressure cuff or thermometer. The AI reads the numbers off the screen and they get scored like any other reading." },
    { tab: "team", target: "alerts", title: "Who has been told", text: "Alerts go to the right person first. If nobody answers in time, the next person is called." },
    { tab: "team", target: "protection", title: "Locked and signed", text: "Everything sent to the cloud is locked, and every alert is signed, so it cannot be read or faked on the way." },
  ] },
  ai: { label: "How the AI summary and PDF work", steps: [
    { tab: "handover", target: "summary", title: "The AI summary", text: "Press the button and an AI writes a short summary for the family and the next nurse. It is checked against the real numbers, so it cannot make any up." },
    { tab: "handover", target: "pdf", title: "Take it with you", text: "Download a one page PDF of the same summary to print or hand over." },
  ] },
  vision: { label: "How reading a device by photo works", steps: [
    { tab: "handover", target: "scan", title: "AI vision", text: "Take a photo of a pulse oximeter, blood pressure cuff or thermometer. The AI reads the numbers off the screen. You check them, then they get scored like any other reading." },
  ] },
  safe: { label: "How my data is protected", steps: [
    { tab: "team", target: "protection", title: "Locked and signed", text: "Everything sent to the cloud is locked, and every alert is signed, so it cannot be read or faked on the way. New phones must be approved here." },
  ] },
};

export function Guide({ setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const [menu, setMenu] = useState(false), [tour, setTour] = useState<string | null>(null), [i, setI] = useState(0), [rect, setRect] = useState<DOMRect | null>(null);
  const steps = tour ? TOURS[tour].steps : [], step = tour ? steps[i] : null, done = tour !== null && i >= steps.length;
  const left = !!rect && rect.left + rect.width / 2 > (typeof window === "undefined" ? 0 : window.innerWidth * 0.62);
  const seen = useRef(false);
  const mark = () => { seen.current = true; try { localStorage.setItem("wz-guide-seen", "1"); } catch { /* ignore */ } };

  // Offer help once, politely, then stay quiet until asked.
  useEffect(() => {
    try { if (localStorage.getItem("wz-guide-seen")) return; } catch { return; }
    const a = setTimeout(() => { if (!seen.current) setMenu(true); }, 2500), b = setTimeout(() => { if (!seen.current) { setMenu(false); mark(); } }, 11000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  // Find the section for this step, bring it into view and follow it.
  useEffect(() => {
    if (!step) { setRect(null); return; }
    setRect(null); // never leave the highlight on the previous section while looking for this one
    setTab(step.tab);
    let el: HTMLElement | null = null, tries = 0, poll: ReturnType<typeof setInterval> | undefined, follow: ReturnType<typeof setInterval> | undefined;
    const attach = () => {
      el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
      if (!el) return false;
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      follow = setInterval(() => { if (el) setRect((p) => { const r = el!.getBoundingClientRect(); return p && Math.abs(p.top - r.top) < 1 && Math.abs(p.left - r.left) < 1 && Math.abs(p.height - r.height) < 1 ? p : r; }); }, 100);
      return true;
    };
    if (!attach()) poll = setInterval(() => { if (attach()) clearInterval(poll); else if (++tries > 30) { clearInterval(poll); setRect(null); } }, 100);
    return () => { clearInterval(poll); clearInterval(follow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, i]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setTour(null); setMenu(false); }
      if (tour && e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length));
      if (tour && e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [tour, steps.length]);

  const start = (k: string) => { mark(); setTour(k); setI(0); setMenu(false); };
  const end = () => { setTour(null); setRect(null); };
  const open = menu || tour !== null;
  const pad = 8, vw = typeof window === "undefined" ? 0 : window.innerWidth, vh = typeof window === "undefined" ? 0 : window.innerHeight;
  const box = rect && { top: Math.max(rect.top - pad, 6), left: Math.max(rect.left - pad, 6), width: Math.min(rect.width + pad * 2, vw - 12), height: Math.min(rect.height + pad * 2, vh - 12) };
  const mood: Mood = done ? "happy" : tour ? "talk" : "idle";

  return (
    <>
      {tour && box && !done && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-40">
          {([
            { top: 0, left: 0, width: vw, height: box.top },
            { top: box.top + box.height, left: 0, width: vw, height: Math.max(vh - box.top - box.height, 0) },
            { top: box.top, left: 0, width: box.left, height: box.height },
            { top: box.top, left: box.left + box.width, width: Math.max(vw - box.left - box.width, 0), height: box.height },
          ]).map((s, n) => <div key={n} className="fixed bg-[rgba(4,9,8,.64)] transition-all duration-300 ease-out" style={s} />)}
          <div className="fixed border-2 border-care-brand transition-all duration-300 ease-out" style={{ top: box.top, left: box.left, width: box.width, height: box.height, borderRadius: 14 }} />
        </div>)}

      <div className={cn("fixed bottom-4 z-50 flex flex-col", left ? "left-4 items-start lg:left-[304px]" : "right-4 items-end")}>
        {open && (
            <motion.div key={(tour ?? "menu") + i + (done ? "d" : "")} role="dialog" aria-label="Guide" aria-live="polite"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="card relative mb-2 w-[min(340px,calc(100vw-2rem))] border border-care-brand/40 bg-care-band p-4 text-[14px] leading-6 shadow-[0_18px_50px_rgba(0,0,0,.55)]">
              <span aria-hidden className={cn("absolute -bottom-[7px] h-3.5 w-3.5 rotate-45 border-b border-r border-care-brand/40 bg-care-band", left ? "left-8" : "right-8")} />
              {!tour && (<>
                <p className="font-semibold">Hi, I am Pip.</p>
                <p className="mt-1 text-care-soft">This page has a lot on it. Want me to show you what is where?</p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {Object.entries(TOURS).map(([k, t], n) => <button key={k} onClick={() => start(k)} className={cn("rd min-h-9 px-3 text-left text-[13px] font-medium transition-colors", n === 0 ? "bg-care-brand font-semibold text-care-onBrand hover:bg-care-brandHover" : "border border-care-line hover:border-care-brand hover:text-care-brand")}>{t.label}</button>)}
                  <button onClick={() => { setMenu(false); mark(); }} className="rd min-h-8 px-3 text-left text-xs text-care-soft hover:text-care-text">Not now</button>
                </div></>)}
              {tour && !done && step && (<>
                <p className="text-xs font-medium text-care-brand">{i + 1} of {steps.length}</p>
                <p className="mt-0.5 text-[16px] font-semibold leading-snug">{step.title}</p>
                <p className="mt-1.5 text-care-soft">{step.text}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button onClick={end} className="rd min-h-8 px-2 text-xs text-care-soft hover:text-care-text">Skip tour</button>
                  <div className="flex gap-1.5">
                    {i > 0 && <button onClick={() => setI(i - 1)} className="rd min-h-9 border border-care-line px-3 text-[13px] font-medium hover:border-care-brand">Back</button>}
                    <button onClick={() => setI(i + 1)} className="rd min-h-9 bg-care-brand px-4 text-[13px] font-semibold text-care-onBrand hover:bg-care-brandHover">{i === steps.length - 1 ? "Finish" : "Next"}</button>
                  </div>
                </div></>)}
              {done && (<>
                <p className="text-[16px] font-semibold">That is everything.</p>
                <p className="mt-1.5 text-care-soft">I will be down here whenever you want me again.</p>
                <div className="mt-3 flex justify-end gap-1.5"><button onClick={() => { setTour(null); setMenu(true); }} className="rd min-h-9 border border-care-line px-3 text-[13px] hover:border-care-brand">More topics</button><button onClick={end} className="rd min-h-9 bg-care-brand px-4 text-[13px] font-semibold text-care-onBrand hover:bg-care-brandHover">Got it</button></div></>)}
            </motion.div>)}
        <motion.button key={left ? "l" : "r"} aria-label={open ? "Close the guide" : "Open the guide, Pip"} aria-expanded={open}
          onClick={() => { mark(); if (tour) end(); else setMenu((m) => !m); }}
          initial={{ y: -14, rotate: left ? -6 : 6 }} animate={{ y: 0, rotate: 0 }} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 320, damping: 14 }}
          className="group relative h-[72px] w-[68px] outline-none focus-visible:[&_svg]:drop-shadow-[0_0_0_2px_#6adcd1]">
          <Pip mood={mood} point={!!tour && !done} className="h-full w-full drop-shadow-[0_6px_14px_rgba(0,0,0,.45)]" />
          {!open && <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-care-brand text-[11px] font-bold text-care-onBrand" style={{ borderRadius: "9999px" }}>?</span>}
        </motion.button>
      </div>
    </>
  );
}
