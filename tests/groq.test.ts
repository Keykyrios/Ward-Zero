import test from "node:test";
import assert from "node:assert/strict";
import { groqJSON, TEXT_MODELS } from "../lib/groq";

type Call = { model: string; body: Record<string, unknown> };
function stub(handler: (model: string) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (_u: unknown, init: { body: string }) => {
    const body = JSON.parse(init.body), res = handler(body.model); calls.push({ model: body.model, body });
    return new Response(JSON.stringify(res.body), { status: res.status });
  }) as typeof fetch;
  process.env.GROQ_API_KEY = "test"; return calls;
}
const ok = (o: unknown) => ({ status: 200, body: { choices: [{ message: { content: JSON.stringify(o) } }] } });
const msg = [{ role: "user", content: "x" }];

test("current default is not a retired model", () => {
  assert.ok(!TEXT_MODELS.some((m) => m.startsWith("llama-3.3") || m.startsWith("llama-3.1")));
  assert.equal(TEXT_MODELS[0], "openai/gpt-oss-120b");
});

test("a retired model is skipped and the next one answers", async () => {
  const calls = stub((m) => m === "llama-3.3-70b-versatile" ? { status: 400, body: { error: { message: "The model `llama-3.3-70b-versatile` has been decommissioned", code: "model_decommissioned" } } } : ok({ family: "fine" }));
  const r = await groqJSON({ models: TEXT_MODELS, first: "llama-3.3-70b-versatile", messages: msg, maxTokens: 500, temperature: 0.2 });
  assert.equal(r.model, "openai/gpt-oss-120b"); assert.deepEqual(r.data, { family: "fine" });
  assert.deepEqual(calls.map((c) => c.model), ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]);
});

test("reasoning models get low effort and room for thinking; others do not", async () => {
  const calls = stub(() => ok({ a: 1 }));
  await groqJSON({ models: ["openai/gpt-oss-120b"], messages: msg, maxTokens: 500, temperature: 0 });
  assert.equal(calls[0].body.reasoning_effort, "low"); assert.ok((calls[0].body.max_tokens as number) >= 1500);
  const c2 = stub(() => ok({ a: 1 }));
  await groqJSON({ models: ["qwen/qwen3.8-27b"], messages: msg, maxTokens: 300, temperature: 0 });
  assert.equal(c2[0].body.reasoning_effort, undefined); assert.equal(c2[0].body.max_tokens, 300);
});

test("a real failure (bad key, rate limit) stops at once instead of burning every model", async () => {
  const calls = stub(() => ({ status: 401, body: { error: { message: "Invalid API Key" } } }));
  await assert.rejects(groqJSON({ models: TEXT_MODELS, messages: msg, maxTokens: 500, temperature: 0 }), /Invalid API Key/);
  assert.equal(calls.length, 1);
  const c2 = stub(() => ({ status: 429, body: { error: { message: "Rate limit reached" } } }));
  await assert.rejects(groqJSON({ models: TEXT_MODELS, messages: msg, maxTokens: 500, temperature: 0 }), /Rate limit/);
  assert.equal(c2.length, 1);
});

test("empty or non-JSON output moves on, and all-failed reports why", async () => {
  const calls = stub((m) => m === "openai/gpt-oss-120b" ? { status: 200, body: { choices: [{ message: { content: "" } }] } } : ok({ done: true }));
  const r = await groqJSON({ models: TEXT_MODELS, messages: msg, maxTokens: 500, temperature: 0 });
  assert.equal(r.model, "openai/gpt-oss-20b"); assert.equal(calls.length, 2);
  stub(() => ({ status: 404, body: { error: { message: "The model does not exist" } } }));
  await assert.rejects(groqJSON({ models: ["a", "b"], messages: msg, maxTokens: 10, temperature: 0 }), /does not exist/);
});
