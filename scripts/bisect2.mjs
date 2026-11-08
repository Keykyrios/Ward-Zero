import chromium from "@sparticuz/chromium"; import puppeteer from "puppeteer-core";
const [, , variant] = process.argv;
const b = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
await p.evaluateOnNewDocument(() => localStorage.setItem("wz-guide-seen", "1"));
if (variant === "noframe") { await p.setRequestInterception(true); p.on("request", r => (r.url().includes("/phone") ? r.abort() : r.continue())); }
await p.goto("http://localhost:3100/ward", { waitUntil: "domcontentloaded" });
const css = { noanim: "*{animation:none!important;transition:none!important}", noecg: ".ecg-strip{display:none!important}", noshadow: "*{box-shadow:none!important;filter:none!important;text-shadow:none!important}", nowill: "*{will-change:auto!important}" }[variant];
await new Promise(r => setTimeout(r, 6500));
if (css) await p.addStyleTag({ content: css });
await new Promise(r => setTimeout(r, 1000));
const t = performance.now(); await p.screenshot({ path: `/tmp/bis2-${variant}.png` }); console.log(variant, "screenshot", Math.round(performance.now() - t) + "ms");
await b.close();
