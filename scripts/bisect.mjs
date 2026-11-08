import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const [, , variant] = process.argv;
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
await p.evaluateOnNewDocument(() => localStorage.setItem("wz-guide-seen", "1"));
if (variant === "noframe") { await p.setRequestInterception(true); p.on("request", r => (r.url().includes("/phone") ? r.abort() : r.continue())); }
if (variant === "noanim") await p.evaluateOnNewDocument(() => { const s = document.createElement("style"); s.textContent = "*{animation:none!important;transition:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.appendChild(s)); });
await p.goto("http://localhost:3100/ward", { waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 7000));
const t0 = Date.now();
const a = await Promise.race([p.metrics(), new Promise(r => setTimeout(() => r(null), 12000))]);
if (!a) { console.log(variant, "-> main thread HUNG (metrics never returned in 12s)"); await b.close(); process.exit(0); }
await new Promise(r => setTimeout(r, 3000)); const c = await p.metrics();
console.log(variant, `-> busy ${(((c.TaskDuration - a.TaskDuration) / 3) * 100).toFixed(0)}% | script ${(((c.ScriptDuration - a.ScriptDuration) / 3) * 100).toFixed(0)}% | layout ${(((c.LayoutDuration - a.LayoutDuration) / 3) * 100).toFixed(0)}% | style ${(((c.RecalcStyleDuration - a.RecalcStyleDuration) / 3) * 100).toFixed(0)}%`);
await b.close();
