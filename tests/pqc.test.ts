// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { makeIdentity, newRoomKey, wrapRoomKey, unwrapRoomKey, seal, open, sealBody, openTree, fingerprint, canon, b64, unb64 } from "../lib/pqc";

const hub = makeIdentity("Ward screen"), phone = makeIdentity("Caregiver phone"), thief = makeIdentity("Stranger");
const pubOf = (id: string) => ({ [hub.id]: hub.dsaPub, [phone.id]: phone.dsaPub }[id]);

test("room key wraps to the right device only", async () => {
  const K = newRoomKey(), w = await wrapRoomKey(phone.kemPub, K);
  assert.deepEqual(await unwrapRoomKey(phone.kemSec, w), K);
  await assert.rejects(unwrapRoomKey(thief.kemSec, w));
  const bad = { ...w, w: b64(Uint8Array.from(unb64(w.w), (x, i) => (i === 3 ? x ^ 1 : x))) };
  await assert.rejects(unwrapRoomKey(phone.kemSec, bad));
});

test("sealed record round-trips, verifies, and hides its content", async () => {
  const K = newRoomKey(), rec = { pid: "p1", text: "more breathless today", by: "Rohan" };
  const t = await seal(K, phone, "phoneNotes/x1", rec);
  assert.ok(!t.includes("breathless") && !atob(t.slice(4)).includes("breathless"));
  const o = await open(K, "phoneNotes/x1", t, pubOf);
  assert.deepEqual(o.data, rec); assert.equal(o.by, phone.id); assert.equal(o.signed, true);
});

test("tampering, wrong key and wrong path are all caught", async () => {
  const K = newRoomKey(), t = await seal(K, hub, "alerts/a1", { tier: "critical" });
  const flipped = "pq1." + b64(Uint8Array.from(unb64(t.slice(4)), (x, i) => (i === 20 ? x ^ 1 : x)));
  await assert.rejects(open(K, "alerts/a1", flipped, pubOf));
  await assert.rejects(open(newRoomKey(), "alerts/a1", t, pubOf));
  assert.equal((await open(K, "alerts/OTHER", t, pubOf)).signed, false, "replay under another path must not verify");
});

test("a forged record from someone with the room key but no trusted identity is dropped", async () => {
  const K = newRoomKey();
  const forged = { e: await seal(K, thief, "acks/a1", { by: "Dr. Mehta", at: 1, via: "caregiver phone" }) };
  const real = { e: await seal(K, phone, "acks/a2", { by: "Rohan", at: 2, via: "caregiver phone" }) };
  const { value, dropped } = await openTree({ a1: forged, a2: real, a3: { by: "Plain", at: 3 } }, K, "acks", pubOf);
  assert.deepEqual(Object.keys(value as object), ["a2"]); assert.equal(dropped, 2);
});

test("sealBody locks sensitive paths and leaves deletes, flags and duty clear", async () => {
  const K = newRoomKey();
  const b = await sealBody({ "alerts/a1": { tier: "elevated" }, "vitals/p1/5": { hr: 90 }, "duty/0": true, alerts: null, "hub/online": true }, K, hub) as Record<string, unknown>;
  assert.ok((b["alerts/a1"] as { e: string }).e.startsWith("pq1."));
  assert.ok((b["vitals/p1/5"] as { e: string }).e.startsWith("pq1."));
  assert.equal(b["duty/0"], true); assert.equal(b.alerts, null); assert.equal(b["hub/online"], true);
  assert.ok(!JSON.stringify(b).includes("elevated"));
});

test("telemetry is sealed but not signed (fast path); decisions are always signed", async () => {
  const K = newRoomKey(), v = await seal(K, hub, "vitals/p1/9", { hr: 80 }), a = await seal(K, hub, "alerts/a9", { tier: "critical" });
  assert.equal((await open(K, "vitals/p1/9", v, () => undefined)).signed, true, "authenticated by the room key");
  assert.equal((await open(K, "alerts/a9", a, () => undefined)).signed, false, "an alert from an unknown sender is not trusted");
  // an insider with the key cannot slip an unsigned record into a signed path
  const sneaky = await seal(K, hub, "vitals/p1/9", { tier: "critical" });
  assert.equal((await open(K, "alerts/a9", sneaky, pubOf)).signed, false);
  const { dropped } = await openTree({ a9: { e: sneaky } }, K, "alerts", pubOf); assert.equal(dropped, 1);
});

test("fingerprints are stable, distinct, and canonical JSON ignores key order", () => {
  assert.equal(fingerprint(hub.dsaPub), fingerprint(hub.dsaPub));
  assert.notEqual(fingerprint(hub.dsaPub), fingerprint(phone.dsaPub));
  assert.equal(canon({ b: 1, a: [2, { d: 1, c: 2 }] }), canon({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

// ---- the whole protocol against an in-memory database that behaves like Firebase multi-path update() ----
import { publicRecord, type PubRecord } from "../lib/pqc";
const mkDb = () => {
  const d: Record<string, unknown> = {};
  return {
    update: (body: Record<string, unknown>) => { for (const [p, v] of Object.entries(body)) { for (const k of Object.keys(d)) if (k === p || k.startsWith(p + "/")) delete d[k]; if (v !== null && v !== undefined) d[p] = v; } },
    tree: (prefix: string) => { const o: Record<string, unknown> = {}; for (const [k, v] of Object.entries(d)) if (k.startsWith(prefix + "/")) { const segs = k.slice(prefix.length + 1).split("/"); let n = o; segs.slice(0, -1).forEach((s) => (n = (n[s] ??= {}) as Record<string, unknown>)); n[segs.at(-1)!] = v; } return o; },
    get: (p: string) => d[p],
  };
};

test("full flow: join, wrap, signed alert to phone, signed ack to hub, forgery rejected, lost phone locked out", async () => {
  const db = mkDb(), H = makeIdentity("Ward screen"), P = makeIdentity("Caregiver phone"), F = makeIdentity("Family view"), X = makeIdentity("Attacker");
  let K = newRoomKey();
  // everyone publishes public keys; the hub trusts phone and family and wraps the room key to each
  db.update({ "keys/hub": publicRecord(H), [`keys/${P.id}`]: publicRecord(P), [`keys/${F.id}`]: publicRecord(F), [`keys/${X.id}`]: publicRecord(X) });
  for (const d of [P, F]) db.update({ [`wrap/${d.id}`]: await wrapRoomKey(d.kemPub, K) });
  const phoneK = await unwrapRoomKey(P.kemSec, db.get(`wrap/${P.id}`) as never);
  const familyK = await unwrapRoomKey(F.kemSec, db.get(`wrap/${F.id}`) as never);
  assert.deepEqual(phoneK, K);
  const keys = () => db.tree("keys") as Record<string, PubRecord>;
  const hubPub = (id: string) => (id === H.id ? H.dsaPub : keys()[id]?.dsa);
  const phonePubOf = (id: string) => (id === (db.get("keys/hub") as PubRecord).id ? (db.get("keys/hub") as PubRecord).dsa : undefined);

  // hub -> cloud -> phone
  db.update(await sealBody({ "alerts/a1": { id: "a1", name: "Asha Rao", tier: "elevated" }, "patients/p1": { name: "Asha Rao", tier: "elevated" }, "hub/online": true }, K, H));
  const raw = JSON.stringify(db.tree("alerts")) + JSON.stringify(db.tree("patients"));
  assert.ok(!raw.includes("Asha") && !raw.includes("elevated"), "cloud must hold ciphertext only");
  const alerts = (await openTree(db.tree("alerts"), phoneK, "alerts", phonePubOf)).value as Record<string, { name: string; _by: string }>;
  assert.equal(alerts.a1.name, "Asha Rao"); assert.equal(alerts.a1._by, H.id);
  const fam = (await openTree(db.tree("patients"), familyK, "patients", phonePubOf)).value as Record<string, { tier: string }>;
  assert.equal(fam.p1.tier, "elevated");

  // phone -> cloud -> hub (signed ack accepted)
  db.update(await sealBody({ "acks/a1": { by: "Rohan", at: 5, via: "caregiver phone" } }, phoneK, P));
  const acks = (await openTree(db.tree("acks"), K, "acks", hubPub)).value as Record<string, { by: string }>;
  assert.equal(acks.a1.by, "Rohan");

  // an attacker who writes to the open database: plain record, record sealed under a key nobody trusts, and a record with a stranger's signature
  db.update({ "acks/evil1": { by: "Dr. Mehta", at: 6, via: "caregiver phone" } });
  db.update(await sealBody({ "acks/evil2": { by: "Dr. Mehta", at: 7, via: "x" } }, newRoomKey(), X));
  db.update(await sealBody({ "acks/evil3": { by: "Dr. Mehta", at: 8, via: "x" } }, K, X));
  const after = await openTree(db.tree("acks"), K, "acks", (id) => (id === X.id ? undefined : hubPub(id)));
  assert.deepEqual(Object.keys(after.value as object), ["a1"]); assert.equal(after.dropped, 3);

  // phone is lost: the hub makes a new key and wraps it only for the family screen
  K = newRoomKey(); db.update({ [`wrap/${P.id}`]: null, [`keys/${P.id}`]: null, [`wrap/${F.id}`]: await wrapRoomKey(F.kemPub, K) });
  db.update(await sealBody({ "alerts/a2": { id: "a2", name: "Vikram Iyer", tier: "critical" } }, K, H));
  const lost = await openTree(db.tree("alerts"), phoneK, "alerts", phonePubOf);
  assert.ok(!JSON.stringify(lost.value).includes("Vikram"), "removed phone must not read new data");
  const newFamK = await unwrapRoomKey(F.kemSec, db.get(`wrap/${F.id}`) as never);
  const seen = (await openTree(db.tree("alerts"), newFamK, "alerts", phonePubOf)).value as Record<string, { name: string }>;
  assert.equal(seen.a2.name, "Vikram Iyer");
  assert.equal(db.get(`wrap/${P.id}`), undefined);
});
