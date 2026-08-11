# wa-api-poc

Minimal proof of concept: type a phone number in an Expo app, tap Send, and a WhatsApp message goes out via Meta's Cloud API (or mock mode with no Meta traffic).

For background, onboarding, and production guidance, see [docs/whatsapp-integration-guide.md](docs/whatsapp-integration-guide.md) and the [Confluence page](https://vo2-usa.atlassian.net/wiki/x/AQCDHQ).

## Prerequisites

- Node.js (current LTS)
- Expo Go on a simulator or device
- **Mock mode** — nothing else; works with no `.env` file
- **Live mode** — Meta developer account with WhatsApp product, test WABA + test number, OTP-verified recipient(s) (max 5), and credentials in `server/.env` (see below)

## Run

Two terminals. Load the app in Expo Go manually (do not press `i` in the Metro terminal — it crashes Expo CLI on this setup).

**Terminal 1 — backend**

```bash
cd server && npm run dev
```

Listens on **http://localhost:3001**. Startup log shows `SEND_MODE=mock` or `SEND_MODE=live`.

**Terminal 2 — mobile**

```bash
cd mobile && npm start
```

Metro on **http://localhost:8081**. Open Expo Go and connect to `exp://127.0.0.1:8081`, or:

```bash
cd mobile && npm run open:ios
```

The app shows a **MOCK** or **LIVE** badge (from `GET /health`), a phone field, and **Send**. Success shows the message id; guardrail failures show a readable error (e.g. cooldown).

## Env vars

Copy examples, then edit:

```bash
cp server/.env.example server/.env
cp mobile/.env.example mobile/.env   # optional; defaults to localhost:3001
```

**Server** (`server/.env`) — secrets stay here only; never commit.

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3001` | Listen port |
| `SEND_MODE` | `mock` | `mock` = no Meta traffic; `live` = real sends |
| `SEND_ALLOWLIST` | _(empty)_ | Comma-separated E.164. Required in live mode; optional in mock |
| `MAX_SENDS_PER_DAY` | `20` | Global daily cap |
| `MAX_SENDS_PER_RECIPIENT_PER_DAY` | `3` | Per-recipient daily cap |
| `RECIPIENT_COOLDOWN_SECONDS` | `300` | Min seconds between sends to same number |
| `MESSAGE_TYPE` | `template` | `template` or `text` (live only; `text` needs an open 24h window) |
| `WHATSAPP_ACCESS_TOKEN` | — | Required for live |
| `WHATSAPP_PHONE_NUMBER_ID` | — | Numeric ID from dashboard, not display number |
| `WHATSAPP_WABA_ID` | — | Required for live |

In live mode the server refuses to start without a non-empty `SEND_ALLOWLIST` and all three Meta vars. Use the same 1–5 numbers you OTP-verified in the Meta test dashboard.

**Mobile** (`mobile/.env`)

| Variable | Default | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:3001` | Backend base URL only — no Meta credentials |

Restart the backend after any `server/.env` change.

## curl examples

**Health**

```bash
curl http://localhost:3001/health
# → {"ok":true,"sendMode":"mock"}
```

**Send** — replace the phone with an allow-listed E.164 number in live mode:

```bash
curl -s -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"+85291234567"}'
```

Success:

```json
{ "ok": true, "messageId": "wamid.MOCK-…", "mock": true }
```

Error (e.g. cooldown):

```json
{ "ok": false, "error": "Cooldown active for this recipient. Try again in 296s." }
```

Common status codes: `400` invalid phone, `403` not on allowlist, `429` cooldown or daily cap, `500` server error. Live-mode Meta errors are mapped to plain English in the `error` field.

## Meta limits (at a glance)

| Limit | Value |
|---|---|
| New portfolio — unique recipients / 24h | 250 (portfolio-level) |
| Same recipient — min interval | 6 seconds (Meta); POC default 300s |
| Throughput | 80 messages/second |
| Test number — OTP-verified recipients | Max 5 |
| Quality rating | Based on 7-day blocks/reports; `Flagged` → tier downgrade; `Restricted` → outbound halted |

Full detail: [docs/whatsapp-integration-guide.md](docs/whatsapp-integration-guide.md).

## Troubleshooting

**Port in use**

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN   # backend
lsof -nP -iTCP:8081 -sTCP:LISTEN   # Metro
kill <PID>
```

**Live send fails**

| Error | Fix |
|---|---|
| Token expired or invalid | Regenerate in Meta API Setup (~24h temp tokens) |
| Recipient not on Meta's test allowlist | OTP-verify the number in the dashboard first |
| Recipient not on `SEND_ALLOWLIST` | Add to `server/.env` and restart |
| Cooldown active | Guardrail working — wait or lower `RECIPIENT_COOLDOWN_SECONDS` for testing |

**Side effects** — sends are logged to the server console and appended to `server/.sendlog.json` (gitignored; contains real phone numbers).
