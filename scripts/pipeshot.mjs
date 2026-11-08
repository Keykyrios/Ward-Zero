import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const [, , out] = process.argv;
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle2" }); await new Promise(r => setTimeout(r, 2500));
const y = await p.evaluate(() => { const h = [...document.querySelectorAll("h3")].find(e => e.textContent === "Sense"); return h.closest("section").getBoundingClientRect().top + scrollY; });
let i = 0; for (const d of [0, 700, 1500, 2300]) { await p.evaluate(v => window.scrollTo({ top: v, behavior: "instant" }), y + d); await new Promise(r => setTimeout(r, 1500)); await p.screenshot({ path: `${out}-${i++}.png` }); }
await b.close();
