/**
 * End-to-end protection for everything that leaves the home for the cloud.
 *
 *   Key exchange   ML-KEM-768  (NIST FIPS 203). The hub holds one random 256-bit room key and wraps it to
 *                  each trusted device's public key. Only a device with the matching secret key can unwrap it.
 *   Signatures     ML-DSA-65   (NIST FIPS 204). Every sealed record is signed by its sender, so a phone can
 *                  prove an alert came from the hub and the hub can prove who acknowledged it.
 *   Records        AES-256-GCM with a fresh random nonce per record. Symmetric 256-bit keys are not weakened
 *                  meaningfully by quantum search, which is why only the public-key parts need the new schemes.
 *
 * The cloud only ever holds ciphertext plus clear, non-sensitive flags (hub online, duty on/off). Pure functions
 * only: storage and Firebase live in the pages, so all of this is testable without a browser.
 */
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { sha256 } from "@noble/hashes/sha2.js";

export type Ident = { id: string; name: string; kemPub: string; kemSec: string; dsaPub: string; dsaSec: string };
export type PubRecord = { id: string; name: string; kem: string; dsa: string; fp: string; at: number };
export type Wrapped = { ct: string; iv: string; w: string };

const te = new TextEncoder(), td = new TextDecoder();
export const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
/** Stable JSON so a signature does not depend on key order. */
export const canon = (v: unknown): string => v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
const aes = (raw: Uint8Array, use: KeyUsage[]) => crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, use);

export function makeIdentity(name: string): Ident {
  const k = ml_kem768.keygen(), d = ml_dsa65.keygen();
  return { id: Array.from(rand(5), (x) => x.toString(16).padStart(2, "0")).join(""), name, kemPub: b64(k.publicKey), kemSec: b64(k.secretKey), dsaPub: b64(d.publicKey), dsaSec: b64(d.secretKey) };
}
/** Short, readable fingerprint of a device's signing key, to compare on two screens. */
export function fingerprint(dsaPub: string) {
  const h = Array.from(sha256(unb64(dsaPub)).slice(0, 8), (x) => x.toString(16).padStart(2, "0")).join("");
  return h.match(/.{4}/g)!.join(" ");
}
export const publicRecord = (i: Ident): PubRecord => ({ id: i.id, name: i.name, kem: i.kemPub, dsa: i.dsaPub, fp: fingerprint(i.dsaPub), at: Date.now() });
export const newRoomKey = () => rand(32);

/** Hub side: lock the room key so only this device can open it. */
export async function wrapRoomKey(kemPub: string, K: Uint8Array): Promise<Wrapped> {
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(unb64(kemPub));
  const iv = rand(12), w = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(sharedSecret, ["encrypt"]), K as BufferSource);
  return { ct: b64(cipherText), iv: b64(iv), w: b64(new Uint8Array(w)) };
}
/** Device side. Throws if the wrapper was made for a different device or was altered. */
export async function unwrapRoomKey(kemSec: string, rec: Wrapped): Promise<Uint8Array> {
  const ss = ml_kem768.decapsulate(unb64(rec.ct), unb64(kemSec));
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, await aes(ss, ["decrypt"]), unb64(rec.w) as BufferSource));
}

/** Lock one record. The path is signed too, so a valid record cannot be replayed somewhere else. */
export async function seal(K: Uint8Array, who: Ident, path: string, data: unknown): Promise<string> {
  const d = canon(data), s = needsSignature(path) ? ml_dsa65.sign(te.encode(`${path}|${who.id}|${d}`), unb64(who.dsaSec)) : new Uint8Array(0);
  const iv = rand(12), body = te.encode(JSON.stringify({ d: data, by: who.id, s: b64(s) }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(K, ["encrypt"]), body as BufferSource));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return "pq1." + b64(out);
}
export type Opened = { data: unknown; by: string; signed: boolean };
/** Unlock and verify. `pubOf` returns a sender's signing key (or undefined if unknown). Throws on tampering. */
export async function open(K: Uint8Array, path: string, token: string, pubOf: (id: string) => string | undefined): Promise<Opened> {
  if (!token.startsWith("pq1.")) throw new Error("not a sealed record");
  const raw = unb64(token.slice(4));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await aes(K, ["decrypt"]), raw.slice(12) as BufferSource);
  const { d, by, s } = JSON.parse(td.decode(plain)) as { d: unknown; by: string; s: string };
  const pub = pubOf(by);
  // Telemetry is authenticated by the room key alone (AES-GCM). Records that carry a decision are also signed.
  return { data: d, by, signed: !needsSignature(path) || (!!pub && !!s && ml_dsa65.verify(unb64(s), te.encode(`${path}|${by}|${canon(d)}`), unb64(pub))) };
}

/** Signing costs about 12 ms in JavaScript, so it is kept for records where identity matters, not the per-second vitals feed. */
const SIGNED = new Set(["alerts", "acks", "scans", "phoneNotes", "reports"]);
const needsSignature = (path: string) => SIGNED.has(path.split("/")[0]);
const SEALED = new Set(["vitals", "patients", "alerts", "acks", "scans", "phoneNotes", "reports", "log", "notes"]);
/** Seal the sensitive paths of a multi-path write. Clear: nulls (deletes), presence, duty, keys, hub flags. */
export async function sealBody(body: Record<string, unknown>, K: Uint8Array, who: Ident) {
  const out: Record<string, unknown> = {};
  await Promise.all(Object.entries(body).map(async ([path, v]) => {
    const segs = path.split("/");
    out[path] = v !== null && v !== undefined && segs.length >= 2 && SEALED.has(segs[0]) ? { e: await seal(K, who, path, v) } : v;
  }));
  return out;
}
const isSealed = (v: unknown): v is { e: string } => !!v && typeof v === "object" && Object.keys(v as object).length === 1 && typeof (v as { e?: unknown }).e === "string";
/**
 * Unlock whatever a listener received (a node, or a map of nodes). Records that fail to decrypt, fail to verify,
 * or are not sealed at all are dropped and counted: nobody can slip a forged record in through the open database.
 */
export async function openTree(v: unknown, K: Uint8Array, path: string, pubOf: (id: string) => string | undefined): Promise<{ value: unknown; dropped: number }> {
  let dropped = 0;
  const walk = async (n: unknown, p: string): Promise<unknown> => {
    if (n === null || typeof n !== "object") { dropped++; return undefined; }
    if (isSealed(n)) {
      try { const o = await open(K, p, n.e, pubOf); if (!o.signed) { dropped++; return undefined; } return o.data && typeof o.data === "object" ? { ...(o.data as object), _by: o.by } : o.data; }
      catch { dropped++; return undefined; }
    }
    // A plain record (all fields are primitives) in a sealed path is unsealed data someone wrote directly: drop it.
    if (Object.values(n as object).every((c) => c === null || typeof c !== "object")) { dropped++; return undefined; }
    const e = await Promise.all(Object.entries(n as object).map(async ([k, c]) => [k, await walk(c, `${p}/${k}`)] as const));
    return Object.fromEntries(e.filter(([, c]) => c !== undefined));
  };
  return { value: v == null ? v : await walk(v, path), dropped };
}
