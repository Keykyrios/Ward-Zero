"use client";
import { useRef, useState } from "react";
import { PROFILES } from "@/lib/engine";
import { cn } from "@/lib/utils";

export type Scan = { id: string; pid: string; at: number; device: string; rr: number | null; spo2: number | null; sys: number | null; hr: number | null; temp: number | null; confidence: string; note: string; by: string };

/** Downscale first: phone photos are 4 to 8 MB, the model needs about 1000 px. */
async function shrink(f: File): Promise<string> {
  const url = URL.createObjectURL(f), img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
  const k = Math.min(1, 1024 / Math.max(img.width, img.height)), c = document.createElement("canvas");
  c.width = img.width * k; c.height = img.height * k; c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.82);
}

/** Computer vision: read the display of a real device from a photo, then hand the numbers to the scorer. */
export function ScanPanel({ onScan, by, defaultPid = "p1" }: { onScan: (s: Scan) => void; by: string; defaultPid?: string }) {
  const [pid, setPid] = useState(defaultPid), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [prev, setPrev] = useState(""), [res, setRes] = useState<Scan | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const go = async (f?: File | null) => {
    if (!f) return;
    setBusy(true); setErr(""); setRes(null);
    try {
      const image = await shrink(f); setPrev(image);
      const r = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) }), j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not read the photo");
      const s: Scan = { id: `${Date.now().toString(36)}`, pid, at: Date.now(), device: j.device, rr: j.rr, spo2: j.spo2, sys: j.sys, hr: j.hr, temp: j.temp, confidence: j.confidence, note: j.note, by };
      if ([s.rr, s.spo2, s.sys, s.hr, s.temp].every((v) => v == null)) throw new Error("No vital sign was readable in that photo. Try again closer, with the display filling the frame.");
      setRes(s);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  const vals: [string, number | null, string][] = res ? [["Resp", res.rr, "/min"], ["SpO2", res.spo2, "%"], ["Systolic", res.sys, "mmHg"], ["Pulse", res.hr, "bpm"], ["Temp", res.temp, "C"]] : [];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="scan-pid">Patient</label>
        <select id="scan-pid" value={pid} onChange={(e) => setPid(e.target.value)} className="min-h-11 border border-care-line bg-care-bg px-3 text-[15px] text-care-text outline-none focus:border-care-brand">
          {PROFILES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => file.current?.click()} disabled={busy} className="min-h-11 bg-care-brand px-5 text-[15px] font-semibold text-care-onBrand hover:bg-care-brandHover disabled:opacity-50">{busy ? "Reading the screen..." : "Take a photo"}</button>
        <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => go(e.target.files?.[0])} />
      </div>
      {err && <p role="alert" className="mt-4 border-l-4 border-care-warn bg-care-warnBg px-4 py-3 text-[15px] leading-7 text-care-text">{err}</p>}
      {res && (
        <div className="mt-6 grid gap-6 sm:grid-cols-[120px_1fr]">
          {prev && <img src={prev} alt="Photo you took" className="h-28 w-28 border border-care-line object-cover" />}
          <div>
            <p className="text-sm text-care-soft">{res.device}. How sure: <span className={cn(res.confidence === "high" ? "text-care-ok font-semibold" : "text-care-warn font-semibold")}>{res.confidence}</span></p>
            <div className="mt-3 grid grid-cols-5 gap-3 num">{vals.map(([l, v, u]) => <div key={l}><div className="text-sm text-care-soft">{l}</div><div className={cn("mt-1 text-2xl font-semibold", v == null && "text-care-soft")}>{v ?? "none"}</div><div className="text-xs text-care-soft">{v == null ? "" : u}</div></div>)}</div>
            {res.note && <p className="mt-3 text-[15px] leading-7 text-care-soft">{res.note}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={() => { onScan(res); setRes(null); setPrev(""); }} className="min-h-11 bg-care-brand px-5 font-semibold text-care-onBrand">Use this reading</button>
              <button onClick={() => { setRes(null); setPrev(""); }} className="min-h-11 border border-care-line px-5 text-[15px] hover:bg-care-band">Discard</button>
            </div>
            <p className="mt-3 text-sm leading-6 text-care-soft">Check the numbers against the display before you use them. A misread digit is possible.</p>
          </div>
        </div>
      )}
    </div>
  );
}
