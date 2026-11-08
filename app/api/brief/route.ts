import { NextResponse } from "next/server";
import { groqJSON, TEXT_MODELS } from "@/lib/groq";
export const runtime = "nodejs";

const SYSTEM = `You write a short handoff brief for a home caregiver from structured data. Use ONLY the facts given. Never diagnose, never suggest medication or doses, never invent numbers.
Return JSON: {"family":string,"sbar":{"situation":string,"background":string,"assessment":string,"recommendation":string}}.
family = 2-3 plain sentences a worried relative can follow. recommendation may only say: look in on them, re-check readings, contact their clinician, or call emergency services when the data says elevated or critical.`;

export async function POST(req: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: "GROQ_API_KEY is not set" }, { status: 500 });
  const facts = await req.json().catch(() => null);
  if (!facts) return NextResponse.json({ error: "No facts" }, { status: 400 });
  try {
    const { data, model } = await groqJSON({ models: TEXT_MODELS, first: process.env.GROQ_TEXT_MODEL, temperature: 0.2, maxTokens: 500, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(facts).slice(0, 6000) }] });
    return NextResponse.json({ ...data, model });
  } catch (e) {
    return NextResponse.json({ error: `Brief service unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
