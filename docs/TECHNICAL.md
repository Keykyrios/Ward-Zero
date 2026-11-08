# Technical documentation

## 1. Problem and solution
Patients at home lack continuous monitoring and an escalation path. Ward Zero simulates sensors, scores each reading with a published early-warning score, learns each patient's own baseline, forecasts 24 to 48 hours ahead, routes alerts to the right person, and tracks the response, including when connectivity or people fail.

## 2. Architecture
Sensor simulator (deterministic, 30 simulated minutes per tick) -> edge hub (scoring, baseline, forecast, alert gate, escalation, run in the browser tab acting as the hub) -> Firebase Realtime Database (`rooms/demo-room/{vitals,alerts,acks,notes,log}`) -> caregiver phone (`/phone`) -> acknowledgement written back -> hub. The hub never depends on the cloud to alert. Stack: Next.js 14, React 18, TypeScript, Tailwind, Firebase RTDB, GSAP, motion, OGL.

## 3. Features mapped to the problem statement
Patient monitoring (5 vitals), caregiver monitoring (roster, check-in, response times, audit log), reliability (uplink cut with ordered store-and-forward, sensor silence detection, off-duty skipping), contextual intelligence (notes, personal baseline), predictive analytics (24 and 48 h forecast), alert and escalation (tiers, routing, timed climb).

## 4. Risk assessment
- **Score**: Royal College of Physicians NEWS2 chart (2017), implemented to the chart's boundaries and unit-tested. SpO2 scale 2 is used only for the patient flagged as clinician-set. Bands: 0-2 stable, any single 3 or total 3-4 watch, 5-6 elevated, 7+ critical.
- **Context** (kept apart from the score): new confusion from a note scores 3 as NEWS2 consciousness does. Symptom and infection words, and a vital sitting 3+ robust sigmas on the harmful side of the patient's own baseline for 3 consecutive readings (2 or more vitals), can lift stable to watch only, never higher, and the UI says so.
- **Forecast**: per vital, a Theil-Sen robust trend over the last 12 hours, damped (phi 0.98), clamped to physiological limits, re-scored with NEWS2. A vital only counts as trending if the change is 3x the residual spread. Confidence is none, low or moderate by how many adverse trends agree. Alerts need confidence above none and projected NEWS2 of 5 or more.
- **Alert gate**: hysteresis (7 hours strictly lower to re-arm), 24 h same-tier cooldown (critical never suppressed), forecast alerts need 24 h or +2 growth to repeat. Silence of 90 minutes raises a Data gap alert; stale data is never scored as current.
- **Routing**: early warnings to family; current elevated to the nurse; critical to the physician; unanswered alerts climb after a timer (20 s in the demo, 10 to 15 minutes in reality); off-duty people are skipped.

## 5. Evidence
`npm test`: every NEWS2 boundary for all five vitals plus scale 2; control patient raises zero alerts in 300 ticks; early signal precedes the elevated band for both declining patients; no patient gets the same tier twice; alert budget; escalation and routing; baseline direction rules; note reading. Browser scenario (`scripts/scenario.mjs`) asserts cut-uplink, offline acknowledgement, sensor silence and roster behaviour.

## 6. Assumptions and limitations
Synthetic patients and a simple linear-then-plateau decline; the detection lead times are properties of that simulator, not clinical evidence. Not clinically validated, not a medical device. Note reading is keyword-based and does not understand negation ("not confused"). Consciousness is only inferred from notes. SpO2 rows for supplemental oxygen are not modelled. The hub runs in a browser tab; a real hub would be a small gateway device. The Firebase config is public and needs proper security rules.

## 7. Future work
Real device ingestion (BLE or MQTT), a learned model compared against the NEWS2 baseline on public ICU data, push notifications, authenticated roles, an on-device store-and-forward database, and clinical validation.

## Update: cloud layer, vision, summaries, reports

**Cloud (Firebase Realtime Database + anonymous auth, presence, restore, phone notes, family view; see README, `rooms/<room>`)**: `hub` (presence with `onDisconnect`, last seen), `patients/<id>` (live summary read by the phone), `vitals/<id>/<t>` (batched once a second), `alerts`, `acks`, `log`, `notes`, `duty` (written by the phone, obeyed by the hub), `scans` (photographed or device-sent readings), `reports`. Structure checks are in `database.rules.json`. The ward's "Check cloud" button performs a write and read-back and reports the result in plain words.

**Resilience**: if the internet is down, writes queue in an ordered outbox that is also mirrored to `localStorage`, so a reload does not lose them; while the link is up the queue is retried every five seconds. Alerts and acknowledgements also travel over a same-device local link, so the hub and the phone keep working with the cloud unreachable. Sensor silence produces a "no readings" state and a data-gap alert instead of a stale score.

**Computer vision**: `/api/vision` sends a downscaled photo to a Groq vision model with a strict JSON schema. Values outside physiological bounds are discarded server-side. The person must review the numbers and press "Use this reading" before anything is scored; a reading that scores urgent or above raises an alert through the normal gate.

**Language model use and its limits**: `/api/brief` rewords facts the scorer already produced. `lib/guard.ts` rejects any reply containing a number that was not in the facts, or any dosing or treatment language, and the ward then shows a deterministic template instead. The model never changes a score, a tier or an alert.

**PDF**: `lib/report.ts` builds a one-page handover (jsPDF) in the browser: score, summary, trend, last twelve readings, alerts and who answered, audit lines, disclaimer.

**Explainability**: every score can be expanded into the per-vital points table; reasons name the personal baseline or the caregiver note when those lifted the result; a note can only raise stable to watch.

**Tests**: 21 unit tests (all NEWS2 boundaries, hysteresis, alert budget, escalation, routing, note reading, scan scoring, brief guard) plus a 9-step browser scenario.

## Post-quantum protection of cloud data

Cloud records are sealed client-side: ML-KEM-768 wraps a 256-bit room key to each trusted device, records are AES-256-GCM, and decisions (alerts, acknowledgements, scans, notes, reports) are signed with ML-DSA-65 over `path|signer|canonical JSON`. Unsigned or unverifiable decision records are dropped by `openTree`. See the Security section of the README for the trust model, the performance reason telemetry is not signed, and the limits.
