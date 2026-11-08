import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto("http://localhost:3100/ward", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 3000));
console.log(await p.evaluate(() => { const o = []; document.querySelectorAll("body *").forEach(e => { const r = e.getBoundingClientRect(); if (r.right > 392 && r.width > 0 && !e.closest("[class*=overflow-x-auto]") && !e.closest("iframe") && !e.closest(".ecg-strip") && !e.closest("section.relative.overflow-hidden")) o.push(e.tagName + "." + String(e.className).slice(0, 70) + " " + Math.round(r.right)); }); return document.documentElement.scrollWidth + "\n" + o.slice(0, 15).join("\n"); }));
await b.close();
