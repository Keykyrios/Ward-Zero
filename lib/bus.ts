/** Same-origin local link (BroadcastChannel). Models the home network: hub and caregiver phone keep talking when the cloud is down. */
export type BusMsg =
  | { type: "write"; w: Record<string, unknown> }
  | { type: "join"; id: string }
  | { type: "hello" }
  | { type: "ack"; id: string; by: string; at: number; via: string };

export function openBus(onMsg: (m: BusMsg) => void) {
  if (typeof BroadcastChannel === "undefined") return { post: (_m: BusMsg) => {}, close: () => {} };
  const c = new BroadcastChannel("ward-zero");
  c.onmessage = (e) => onMsg(e.data as BusMsg);
  return { post: (m: BusMsg) => c.postMessage(m), close: () => c.close() };
}
