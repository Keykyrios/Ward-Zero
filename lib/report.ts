import { clock, news2, type PatState } from "./engine";
import type { Alert, LogRow } from "./ward";
import type { Brief } from "./brief";

/** One-page shift handover for a patient. Built in the browser; nothing leaves the device unless the caller stores it. */
export async function makeReport(P: PatState, alerts: Alert[], log: LogRow[], brief: Brief, t: number) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "pt", format: "a4" }), W = doc.internal.pageSize.getWidth(), M = 48;
  let y = 56;
  doc.setFont("helvetica", "bold").setFontSize(22).text("Ward Zero", M, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110).text(`Handover report, simulated clock ${clock(t)}, printed ${new Date().toLocaleString()}`, M, (y += 16));
  doc.setTextColor(0).setFont("helvetica", "bold").setFontSize(16).text(P.p.name, M, (y += 34));
  doc.setFont("helvetica", "normal").setFontSize(10).text(`${P.p.age}, ${P.p.cond}`, M, (y += 15));
  const tierCol: Record<string, [number, number, number]> = { stable: [30, 120, 110], watch: [170, 120, 0], elevated: [190, 60, 40], critical: [170, 20, 30] };
  doc.setFillColor(...tierCol[P.a.tier]).rect(W - M - 150, 48, 150, 54, "F");
  doc.setTextColor(255).setFont("helvetica", "bold").setFontSize(20).text(`NEWS2 ${P.a.total}`, W - M - 140, 72).setFontSize(10).text(P.a.tier.toUpperCase(), W - M - 140, 90);
  doc.setTextColor(0);

  const block = (title: string, body: string) => {
    doc.setFont("helvetica", "bold").setFontSize(11).text(title, M, (y += 28));
    doc.setFont("helvetica", "normal").setFontSize(10);
    const lines = doc.splitTextToSize(body, W - M * 2) as string[]; doc.text(lines, M, (y += 15)); y += lines.length * 12 - 12;
  };
  block("In plain words", brief.family);
  doc.setFont("helvetica", "bold").setFontSize(11).text("SBAR", M, (y += 28));
  autoTable(doc, { startY: y + 6, theme: "grid", styles: { fontSize: 9, cellPadding: 5 }, headStyles: { fillColor: [20, 30, 28] }, columnStyles: { 0: { cellWidth: 90, fontStyle: "bold" } },
    body: [["Situation", brief.sbar.situation], ["Background", brief.sbar.background], ["Assessment", brief.sbar.assessment], ["Recommendation", brief.sbar.recommendation]] });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // score trend, drawn with plain lines so it prints in black and white
  const sc = P.scores.slice(-48), cx = M, cy = y + 40, cw = W - M * 2, ch = 70;
  doc.setFont("helvetica", "bold").setFontSize(11).text("NEWS2 over the last 24 simulated hours", M, y + 26);
  doc.setDrawColor(200).setLineDashPattern([2, 3], 0);
  for (const v of [5, 7]) { const yy = cy + ch - (v / 12) * ch; doc.line(cx, yy, cx + cw, yy); doc.setFontSize(8).setTextColor(120).text(String(v), cx + cw + 4, yy + 3); }
  doc.setLineDashPattern([], 0).setDrawColor(20).setLineWidth(1.4).setTextColor(0);
  sc.forEach((v, i) => { if (i) { const a = sc[i - 1]; doc.line(cx + ((i - 1) / Math.max(1, sc.length - 1)) * cw, cy + ch - (Math.min(a, 12) / 12) * ch, cx + (i / Math.max(1, sc.length - 1)) * cw, cy + ch - (Math.min(v, 12) / 12) * ch); } });
  doc.setLineWidth(0.5);

  autoTable(doc, { startY: cy + ch + 20, theme: "striped", styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: [20, 30, 28] },
    head: [["Time", "Resp", "SpO2", "SBP", "Pulse", "Temp", "NEWS2"]],
    body: P.hist.slice(-12).reverse().map((r) => [clock(r.t), r.rr, r.spo2, r.sys, r.hr, r.temp, news2(r, { scale2: P.p.scale2 }).total]) });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const mine = alerts.filter((a) => a.pid === P.p.id);
  autoTable(doc, { startY: y + 18, theme: "striped", styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: [20, 30, 28] },
    head: [["Alert", "Tier", "Sent to / answered by", "Reason"]],
    body: mine.length ? mine.slice(0, 8).map((a) => [`${a.kind} @ ${clock(a.t)}`, a.tier, a.ackBy ? `Acknowledged by ${a.ackBy}` : "Not acknowledged", a.why[0] ?? ""]) : [["No alerts raised", "", "", ""]] });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const rows = log.filter((l) => l.text.includes(P.p.name)).slice(0, 8).map((l) => [new Date(l.at).toLocaleTimeString([], { hour12: false }), l.text]);
  if (rows.length) autoTable(doc, { startY: y + 18, theme: "plain", styles: { fontSize: 8, cellPadding: 2 }, head: [["Audit", "Event"]], body: rows, columnStyles: { 0: { cellWidth: 50 } } });

  doc.setFontSize(7.5).setTextColor(120).text(doc.splitTextToSize(`Simulated sensors and synthetic data. NEWS2 is a published early warning score (Royal College of Physicians). Brief written by: ${brief.model}. Not a medical device, not clinically validated; does not replace professional care or emergency services.`, W - M * 2) as string[], M, doc.internal.pageSize.getHeight() - 40);
  const name = `ward-zero-${P.p.name.toLowerCase().replace(/\s+/g, "-")}-${clock(t).replace(/[^\w]+/g, "")}.pdf`;
  doc.save(name);
  return name;
}
