import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const [, , url, out, w = "1440", h = "900", y = "0"] = process.argv;
const b = await puppeteer.launch({ args: [...chromium.args, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], executablePath: await chromium.executablePath(), headless: "shell" });
const p = await b.newPage(); await p.setViewport({ width: +w, height: +h });
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 }); await new Promise(r => setTimeout(r, 3000));
await p.evaluate(v => window.scrollTo({ top: v, behavior: "instant" }), +y); await new Promise(r => setTimeout(r, 1500));
await p.screenshot({ path: out }); await b.close();
