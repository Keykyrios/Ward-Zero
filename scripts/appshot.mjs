import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const [, , out, w = "1440", h = "900"] = process.argv;
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
const p = await b.newPage(); await p.setViewport({ width: +w, height: +h });
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.goto("http://localhost:3100/ward", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 2500));
const click = async t => { await p.evaluate(t => { const e = [...document.querySelectorAll("button")].find(b => b.textContent.includes(t)); e && e.click(); }, t); await new Promise(r => setTimeout(r, 500)); };
for (let i = 0; i < 12; i++) await click("Skip ahead");
await click("Pause time"); await new Promise(r => setTimeout(r, 1500));
await p.screenshot({ path: `${out}-overview.png` });
for (const t of ["Readings", "Handover", "Care team"]) { await click(t); await new Promise(r => setTimeout(r, 1200)); await p.screenshot({ path: `${out}-${t.split(" ")[0]}.png` }); }
console.log("errors:", errs.slice(0, 5)); await b.close();
