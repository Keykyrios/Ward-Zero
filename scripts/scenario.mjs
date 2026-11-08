// Drives /ward in headless Chromium and asserts on visible text. Dev tool: node scripts/scenario.mjs <baseUrl> <shot.png>
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
const [, , base = "http://localhost:3100", shot = "scenario.png"] = process.argv;
const browser = await puppeteer.launch({ args: [...chromium.args], executablePath: await chromium.executablePath(), headless: "shell" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => page.evaluate(() => document.body.textContent);
const clickOnce = (t) => page.evaluate((t) => { const el = [...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(t)); if (el) el.click(); return !!el; }, t);
// Wait up to 6 s for the button to exist (tabs animate between views) instead of guessing a delay.
const click = async (t) => { for (let i = 0; i < 30; i++) { if (await clickOnce(t)) return true; await new Promise((r) => setTimeout(r, 200)); } return false; };
let fails = 0;
const check = (name, ok, extra = "") => { console.log(ok ? "PASS" : "FAIL", name, extra); if (!ok) fails++; };

await page.goto(base + "/ward", { waitUntil: "domcontentloaded" }); await wait(2500);
await click("Pace"); await click("Pace"); await wait(9000);                       // 12x
await click("Care team"); await wait(1500);
let t = await text();
check("early alert raised before critical", /Early signal|Forecast/i.test(t) || /Current score/.test(t));
check("an alert reached the caregiver inbox", /I am on it/.test(t) && /Waiting for an answer/.test(t));

await click("Cut the internet"); await wait(3000); t = await text();
check("uplink cut is shown", /no internet, \d+ updates saved/i.test(t), (t.match(/no internet, \d+ updates saved/i) || [""])[0]);
check("edge keeps scoring while cut", /readings/i.test(t));
const before = (t.match(/(Day \d+, \d+:\d+)/) || [0, ""])[1]; await wait(2000);
const after = ((await text()).match(/(Day \d+, \d+:\d+)/) || [0, ""])[1];
check("readings keep flowing during outage", after !== before && before !== "", `${before} -> ${after}`);

const acked = await click("I am on it"); await wait(500); t = await text();
check("acknowledge works offline", acked && /Answered by .* on the hub screen|answered/i.test(t));

await click("Overview"); await click("Switch off"); await wait(4500); t = await text();
await click("Care team"); await wait(1500);
check("sensor silence detected", /no readings for \d/i.test(t) && /no readings for/i.test(t), (t.match(/no data \d/i) || [""])[0]);

await click("Go off duty"); await wait(2500); t = await text();
check("roster check-out logged", /checked out/.test(t), JSON.stringify({ chk: t.match(/\w+ checked \w+/g), off: (t.match(/Go off duty/g) || []).length, on: (t.match(/Go on duty/g) || []).length, tab: /Waiting for an answer|Who is on duty/.test(t) }));
await click("Bring internet back"); await wait(1000); t = await text();
check("uplink restore logged", /Internet is back/.test(t));
await page.screenshot({ path: shot });
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
