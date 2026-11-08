// Headless screenshot helper (dev only). Usage: node scripts/shot.mjs <url> <out.png> [w] [h] [scrollY] [fullPage 0|1] [clickText]
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const [, , url, out, w = "1440", h = "900", scrollY = "0", full = "0", clickText = ""] = process.argv;
const browser = await puppeteer.launch({
  args: [...chromium.args, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  executablePath: await chromium.executablePath(),
  headless: "shell",
});
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h });
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) console.log("[console]", m.type(), m.text().slice(0, 220));
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => console.log("goto:", e.message));
await new Promise((r) => setTimeout(r, 3500));
if (clickText) {
  const hit = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("button,a")].find((b) => b.textContent && b.textContent.includes(t));
    if (el) { el.click(); return true; }
    return false;
  }, clickText);
  console.log("click", clickText, hit);
  await new Promise((r) => setTimeout(r, +(process.env.WAIT || 2500)));
}
if (+scrollY) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), +scrollY);
  await new Promise((r) => setTimeout(r, 2000));
}
await page.screenshot({ path: out, fullPage: full === "1" });
const info = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, fonts: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family) }));
console.log("page", JSON.stringify(info));
await browser.close();
