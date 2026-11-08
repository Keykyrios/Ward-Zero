import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const [, , out] = process.argv;
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
await p.goto("http://localhost:3100/ward", { waitUntil: "domcontentloaded" }); await new Promise(r => setTimeout(r, 3000));
const clip = async f => { const h = await p.evaluateHandle(() => [...document.querySelectorAll("h2")].find(e => e.textContent === "How alerts travel").parentElement); await (await h.asElement()).screenshot({ path: `${out}-${f}.png` }); };
await clip("ok");
await p.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.includes("Cut the internet")).click()); await new Promise(r => setTimeout(r, 1200)); await clip("cut");
await b.close();
