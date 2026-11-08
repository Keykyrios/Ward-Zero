import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const [, , out, w = "1440", h = "900", shots = "0,2,5,7,9,11"] = process.argv; const want = new Set(shots.split(",").map(Number));
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
const p = await b.newPage(); await p.setViewport({ width: +w, height: +h });
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:3100/ward", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 2000));
await new Promise(r => setTimeout(r, 3000)); // let the first readings arrive
await p.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.includes("Pause time"))?.click());
const clickText = t => p.evaluate(t => { const e = [...document.querySelectorAll("[role=dialog] button, button")].find(b => b.textContent.trim().startsWith(t)); if (e) e.click(); return !!e; }, t);
await p.screenshot({ path: `${out}-offer.png` }); // the one-time offer should be visible by ~2.5s
await new Promise(r => setTimeout(r, 1200)); await p.screenshot({ path: `${out}-offer.png` });
console.log("offer visible:", await p.evaluate(() => !!document.querySelector("[role=dialog]")));
if (!(await p.evaluate(() => !!document.querySelector("[role=dialog]")))) await p.evaluate(() => document.querySelector("button[aria-label^='Open the guide']")?.click());
await new Promise(r => setTimeout(r, 800));
console.log("start:", await clickText("Show me around")); 
const rows = [];
for (let i = 0; i < 12; i++) {
  await new Promise(r => setTimeout(r, 1700));
  const s = await p.evaluate(() => { const d = document.querySelector("[role=dialog]"); const t = d?.querySelector("p.font-semibold, p.text-\\[16px\\]")?.textContent; const sp = [...document.querySelectorAll("div")].find(e => e.className.toString().includes("border-care-brand") && e.className.toString().includes("fixed")); const r = sp?.getBoundingClientRect(); const dr = d?.getBoundingClientRect(); return { title: t, count: d?.querySelector("p.text-care-brand")?.textContent, spot: r && { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }, onscreen: !!r && r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, overlapsBubble: !!(r && dr && !(dr.right < r.left || dr.left > r.right || dr.bottom < r.top || dr.top > r.bottom)), overflowX: document.documentElement.scrollWidth - innerWidth }; });
  console.log("step", i, s.title, Math.round(performance.now()/1000)+"s"); rows.push(s); if (want.has(i)) await p.screenshot({ path: `${out}-step${i}.png` });
  await clickText(i === 11 ? "Finish" : "Next");
}
await new Promise(r => setTimeout(r, 800)); await p.screenshot({ path: `${out}-end.png` });
for (const [i, r] of rows.entries()) console.log(i + 1, r.count, "|", r.title, "| spot on screen:", r.onscreen, JSON.stringify(r.spot), "| bubble overlaps spotlight:", r.overlapsBubble, "| overflowX:", r.overflowX);
console.log("page errors:", errs); await b.close();
