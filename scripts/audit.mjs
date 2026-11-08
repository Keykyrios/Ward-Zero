import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/ERR_TUNNEL|WebSocket|firebase|Failed to load resource/i.test(m.text()) && errs.push(m.text()));
  await p.goto("http://localhost:3100/ward", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 2500));
  const click = async t => { await p.evaluate(t => { const e = [...document.querySelectorAll("button")].find(b => b.textContent.includes(t)); e && e.click(); }, t); await new Promise(r => setTimeout(r, 1300)); };
  const out = [];
  for (const t of ["Overview", "Readings", "Handover", "Care team"]) { await click(t); out.push(t + ":" + await p.evaluate(() => document.documentElement.scrollWidth)); }
  await click("Overview");
  for (let i = 0; i < 3; i++) await click("Pace");   // -> Very fast
  await p.evaluate(() => { window.__lt = 0; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt += e.duration)).observe({ entryTypes: ["longtask"] }); });
  await new Promise(r => setTimeout(r, 6000));
  console.log(`${w}px width: ${out.join(" ")} | long-task ms in 6s at Very fast: ${Math.round(await p.evaluate(() => window.__lt))} | errors: ${JSON.stringify(errs.slice(0, 3))}`);
  await p.close();
}
await b.close();
