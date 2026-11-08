import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const [, , out, w = "1440", h = "900", ...ys] = process.argv;
const b = await puppeteer.launch({ args: [...chromium.args, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], executablePath: await chromium.executablePath(), headless: "shell" });
const p = await b.newPage(); await p.setViewport({ width: +w, height: +h });
await p.goto("http://localhost:3100/ward", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 3000));
const click = t => p.evaluate(t => { const e = [...document.querySelectorAll("button")].find(b => b.textContent.trim().startsWith(t)); if (e) e.click(); }, t);
for (let i = 0; i < 12; i++) { await click("Skip ahead"); await new Promise(r => setTimeout(r, 120)); }
await click("Pause"); await new Promise(r => setTimeout(r, 2500));
let i = 0; for (const y of ys) { await p.evaluate(y => window.scrollTo({ top: y, behavior: "instant" }), +y); await new Promise(r => setTimeout(r, 1800)); await p.screenshot({ path: `${out}-${i++}.png` }); }
await b.close();
