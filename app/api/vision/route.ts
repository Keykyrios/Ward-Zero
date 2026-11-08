import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { groqJSON, VISION_MODELS } from "@/lib/groq";
const PROMPT = `You read medical device displays from a photo (pulse oximeter, blood pressure cuff, thermometer, or a monitor).
Return ONLY JSON: {"device":string,"rr":number|null,"spo2":number|null,"sys":number|null,"hr":number|null,"temp":number|null,"confidence":"high"|"medium"|"low","note":string}.
rr = breaths per minute, spo2 = percent, sys = systolic mmHg, hr = pulse bpm, temp = Celsius (convert Fahrenheit).
Use null for anything not clearly visible. Never guess a digit you cannot read. note = one short sentence on what you saw or why confidence is low.`;

export async function POST(req: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: "GROQ_API_KEY is not set" }, { status: 500 });
  const { image } = (await req.json().catch(() => ({}))) as { image?: string };
  if (!image?.startsWith("data:image/")) return NextResponse.json({ error: "Send a data:image/... URL" }, { status: 400 });
  try {
    const { data: o, model } = await groqJSON({ models: VISION_MODELS, first: process.env.GROQ_VISION_MODEL, temperature: 0, maxTokens: 300, timeoutMs: 25000,
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: image } }] }] });
    const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && v >= lo && v <= hi ? v : null);
    return NextResponse.json({
      device: String((o as { device?: unknown }).device ?? "unknown").slice(0, 40), rr: num(o.rr, 4, 60), spo2: num(o.spo2, 50, 100), sys: num(o.sys, 50, 260), hr: num(o.hr, 20, 220), temp: num(o.temp, 30, 43),
      confidence: ["high", "medium", "low"].includes(o.confidence as string) ? o.confidence : "low", note: String(o.note ?? "").slice(0, 200), model,
    });
  } catch (e) {
    return NextResponse.json({ error: `Vision service unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
