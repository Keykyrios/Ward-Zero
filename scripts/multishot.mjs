// node scripts/multishot.mjs <url> <prefix> <speedClicks> <waitMs> <w> <h> y1,y2,...
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
const [, , url, prefix, clicks = "0", waitMs = "0", w = "1440", h = "900", ys = "0"] = process.argv;
const browser = await puppeteer.launch({ args: [...chromium.args, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"], executablePath: await chromium.executablePath(), headless: "shell" });
const page = await browser.newPage(); await page.setViewport({ width: +w, height: +h });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/TUNNEL|WebSocket|firebase/i.test(m.text())) console.log("[console]", m.text().slice(0, 200)); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); await wait(3500);
for (let i = 0; i < +clicks; i++) { await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Speed/.test(b.textContent.trim()))?.click()); await wait(300); }
await wait(+waitMs);
for (const [i, y] of ys.split(",").entries()) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), +y); await wait(1800);
  await page.screenshot({ path: `${prefix}-${i}.png` });
}
console.log("height", await page.evaluate(() => document.documentElement.scrollHeight));
await browser.close();
