# Ward Zero: a hospital ward inside a bedroom

Intelligent home healthcare monitoring and response. Sense, understand, predict, alert, respond, entirely software-simulated.
Prototype for the Operation Ward Zero hackathon. Synthetic data only. Not a medical device.

## Run it
    npm install
    npm run dev          # http://localhost:3000  (first compile can take a minute)
    npm test             # 19 engine tests, including every NEWS2 chart boundary
    npm run gen:data     # regenerates data/synthetic/*.csv

Routes: `/` landing, `/ward` hub dashboard, `/phone` second device (caregiver). Open `/phone` in another window or on a real phone.
Firebase Realtime Database config lives in `lib/firebase.ts`. In the Firebase console (Realtime Database, Rules) allow read and write on `rooms/demo-room` for the demo and tighten afterwards:

    { "rules": { "rooms": { "demo-room": { ".read": true, ".write": true } } } }

The ward reports exactly which problem it has: `Firebase live`, `Firebase rules block writes` (rules above), or `Firebase unreachable` (network). In either failure the hub keeps working and the phone page still syncs with the ward over a local same-device link, so the demo never dies on stage.

## Demo path (3 minutes)
1. `/ward`, press 12x. Pipeline strip counts readings, scores, forecasts, alerts.
2. Asha Rao gets a Forecast alert hours before her NEWS2 band turns elevated. Open "Why this assessment".
3. Add the note "seems confused this morning" and watch the score change with the reason listed.
4. Cut uplink: readings keep flowing, alerts keep firing, writes buffer. Restore: they flush in order.
5. Switch off Asha's sensor: a Data gap alert appears, the score is flagged stale.
6. Check Rohan out: alerts skip him. Leave an alert unanswered 20 s: it escalates. Acknowledge from `/phone`.

## Layout
- `lib/engine.ts` simulator, NEWS2, baseline, forecast, alert gate, escalation (pure, tested)
- `lib/firebase.ts`, `lib/ward.ts` transport and shared types
- `app/ward`, `app/phone`, `app/page.tsx` interfaces
- `components/rb` ReactBits (Threads, SplitText, CountUp, SpotlightCard), `components/cy` Componentry (split-flap, annotated text), `components/mp` motion-primitives
- `components/ward/ObsChart.tsx` the observation chart: one column per reading, cells shaded by NEWS2 points, total row, hatched gaps
- `components/Journey.tsx`, `VelocityMarquee.tsx`, `ScrollBar.tsx` scroll-driven landing sections (Motion useScroll / useVelocity / useSpring)
- `tests/`, `scripts/`, `data/synthetic/`, `docs/TECHNICAL.md`

## Cloud, PDF and AI
- Set `GROQ_API_KEY` in `.env.local` (Groq). Without it the app still runs; the brief falls back to a template and photo reading reports an error.
- Models: summaries try `openai/gpt-oss-120b`, then `openai/gpt-oss-20b`, then `qwen/qwen3.6-27b`; photo reading tries `qwen/qwen3.8-27b`, then `qwen/qwen3.6-27b` (`lib/groq.ts`). A model that has been retired or is not allowed for your key is skipped automatically; a bad key or a rate limit stops at once with the real message. Groq retired `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` for free and developer keys on 2026-08-16, which is why they are no longer used. To pin your own choice, set `GROQ_TEXT_MODEL` or `GROQ_VISION_MODEL`; it is tried first. Model names change, so check Groq's current model list if both fallbacks ever fail.
- `/api/vision` reads device displays from a photo (Groq vision). `/api/brief` rewords scorer output into a family summary and SBAR. Both only see facts the engine computed.
- "Download PDF report" builds a one-page handover in the browser (jsPDF).
- Firebase layout under `rooms/demo-room`: `hub` (online, lastSeen, onDisconnect presence), `patients/{id}` (live summary, read by the phone), `vitals/{id}/{t}` (batched once a second), `alerts`, `acks`, `log`, `notes`, `duty` (phone toggles, hub listens), `scans` (photographed readings from either device), `reports`.

## Design notes
The ward and phone screens are deliberately light and plain, modelled on how real hospital sites work (Mayo Clinic, Cleveland Clinic, One Medical): service first, one tinted notice with the next step, borders instead of shadows, plain words instead of jargon. Alerts appear in the page, never as pop-ups. Colour is always paired with a shape and a word.
Firebase security rules are an admin matter and are only described here: allow read/write on `rooms/demo-room` (see above). The UI says "Saving paused" instead.

## Sending real readings
Any device or script can send a reading over the Firebase REST API; the hub scores it exactly like a photographed one:
```
curl -X PUT "https://<your-db>.firebaseio.com/rooms/demo-room/scans/dev1.json" \
  -d '{"id":"dev1","pid":"p1","at":1730000000000,"device":"home gateway","rr":24,"spo2":91,"sys":118,"hr":108,"temp":37.4,"confidence":"high","note":"","by":"gateway"}'
```
Deploy the structure checks in `database.rules.json` with `firebase deploy --only database`. The "Check cloud" button on the ward writes and reads back a value so you can confirm the connection in one click.

## Cloud features (all live through Firebase Realtime Database)
- **Anonymous sign-in** on every device, so each screen has an identity.
- **Presence**: the ward shows who is connected right now (ward screen, each caregiver's phone, family view); the server marks a device offline when it drops.
- **Restore**: alerts and acknowledgements survive a reload and are shared by every screen.
- **Phone to ward**: notes typed on a caregiver's phone are read by the scorer and can raise risk; duty check-in/out from the phone changes escalation routing; photographed readings from either device are scored.
- **Cloud history on the phone**: a score sparkline per patient from `vitals/<id>`.
- **/family**: read-only plain-language page for relatives, live from the same room.
Before first use, publish the rules from `database.rules.json` in the Firebase console (Realtime Database, Rules). Without them the app still runs locally; with them the phone, family view and presence go live.

## Security: post-quantum, end to end

Health data is the most sensitive thing this app touches, and the cloud database is shared, so everything that goes to Firebase is locked before it leaves the device. The code is in `lib/pqc.ts` (pure functions), `lib/pqstore.ts` and `lib/usePQDevice.ts` (browser glue).

| Job | Method | Standard |
|---|---|---|
| Hand the room key to a trusted phone | ML-KEM-768 key exchange | NIST FIPS 203 |
| Prove who sent an alert, note, scan or acknowledgement | ML-DSA-65 signature | NIST FIPS 204 |
| Lock every record | AES-256-GCM, fresh nonce per record | FIPS 197 / SP 800-38D |

How it works: the ward screen makes a random 256-bit room key and keeps it. Each phone and family screen makes its own ML-KEM and ML-DSA keys in the browser and publishes only the public halves. When the ward trusts a device it wraps the room key to that device's public key, so only that device can open it. Devices on the same home link (same browser) are trusted automatically; others show up under Care team, Protection, with a short fingerprint to compare, and wait for **Approve**. **Stop trusting** makes a new room key and gives it only to the remaining devices, which is what you do when a phone is lost.

What the cloud can see: ciphertext for vitals, patient status, alerts, acknowledgements, scans, notes, reports and the log; plus clear flags (hub online, duty on or off, presence names) and path names. What it cannot do: read the records, or make a phone believe a forged alert. Alerts, acknowledgements, scans, notes and reports must carry a valid signature from a known device or they are dropped, and each signature covers its database path so a real record cannot be replayed somewhere else. The high-volume vitals feed is sealed but not signed, because ML-DSA signing costs about 12 ms per record in JavaScript and would make the ward stutter; AES-GCM already makes it tamper-proof to anyone without the room key. The offline outbox kept in browser storage is sealed with the same key.

Tested (`npm test`, 29 tests): key wrapping reaches only the intended device; tampering, a wrong key and a replay under another path are all caught; a plain or foreign-signed record in the open database is dropped; and a full hub, phone, family and attacker run over an in-memory copy of Firebase's multi-path update, including a lost phone being locked out of new data.

Limits, stated plainly:
- The wires to Firebase are ordinary HTTPS. Recent Chrome and Firefox already use a hybrid post-quantum key exchange for TLS, but that is the browser and Google's doing, not this project's.
- A phone checks the ward's fingerprint on first contact and remembers it (trust on first use). If an attacker is already in the middle on that first contact, the check cannot help. Compare the fingerprint on both screens when pairing a real phone.
- Secret keys sit in browser storage, not a hardware key store. Anyone with the unlocked device has them.
- Encryption cannot stop someone deleting or flooding an open database. Tighten `database.rules.json` for anything beyond a demo.
- Records from before a key change stay under the old key.
- This is a hackathon prototype built on an open-source library, not an audited medical or security product.
