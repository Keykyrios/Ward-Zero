/**
 * Groq chat call that survives model retirements. Models are tried in order; a model that is gone,
 * renamed or not allowed for this key is skipped, any other failure (bad key, rate limit, timeout) stops at once.
 * Set GROQ_TEXT_MODEL / GROQ_VISION_MODEL to put your own choice first.
 */
export const TEXT_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"];
export const VISION_MODELS = ["qwen/qwen3.8-27b", "qwen/qwen3.6-27b"];

const gone = (status: number, msg: string, code?: string) =>
  [400, 403, 404].includes(status) && /decommission|deprecat|not found|does not exist|no longer|not supported|model_not_found|access|permission/i.test(`${code ?? ""} ${msg}`);

export async function groqJSON(opts: { models: string[]; first?: string; messages: unknown[]; maxTokens: number; temperature: number; timeoutMs?: number }): Promise<{ data: Record<string, unknown>; model: string }> {
  const key = process.env.GROQ_API_KEY; if (!key) throw new Error("GROQ_API_KEY is not set");
  const base = process.env.GROQ_BASE || "https://api.groq.com/openai/v1";
  const list = [...new Set([opts.first, ...opts.models].filter(Boolean) as string[])];
  let last = "no model tried";
  for (const model of list) {
    const reasoning = model.startsWith("openai/gpt-oss");
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: opts.temperature, max_tokens: reasoning ? opts.maxTokens + 1500 : opts.maxTokens, response_format: { type: "json_object" }, ...(reasoning ? { reasoning_effort: "low" } : {}), messages: opts.messages }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { last = j?.error?.message || `Groq error ${r.status}`; if (gone(r.status, last, j?.error?.code)) continue; throw new Error(last); }
    try { return { data: JSON.parse(j.choices[0].message.content), model }; }
    catch { last = `${model} returned no usable JSON`; continue; }
  }
  throw new Error(last);
}
