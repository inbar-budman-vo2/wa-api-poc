# wa-api-poc

Minimal proof of concept: type a phone number in an Expo app, tap Send, and a WhatsApp message goes out via Meta's Cloud API (or mock mode with no Meta traffic).

For Meta concepts, onboarding, pricing, limits, and production guidance, see the [WhatsApp Business Platform Integration Guide](https://vo2-usa.atlassian.net/wiki/x/AQCDHQ) on Confluence. This README covers how **this repo** works.

## What this repo is

```
mobile/          Expo app — phone input, Send button, MOCK/LIVE badge
server/          Express API — POST /api/send, guardrails, Meta call
server/.env      Meta credentials + SEND_MODE (gitignored)
server/.sendlog.json   Send history for caps/cooldown (gitignored)
```

The Meta access token never leaves the backend. The mobile app only knows `EXPO_PUBLIC_API_URL`.

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

## Mock vs live

| Mode | Env | Behavior |
|---|---|---|
| `mock` (default) | `SEND_MODE=mock` or unset | Logs send, returns `wamid.MOCK-…`. No Meta traffic. No `.env` required. |
| `live` | `SEND_MODE=live` + Meta vars + allowlist | HTTPS POST to `graph.facebook.com` with an approved template (`hello_world` by default, or a custom template via env). Server refuses to boot if credentials or allowlist are missing. |

The mobile badge reads `sendMode` from `GET /health` so live sends are never accidental.

## Two allowlists (live mode, test number)

While on Meta's test number, both must include the same E.164 numbers:

| Layer | Where | What blocks |
|---|---|---|
| **Meta** | Developer dashboard → WhatsApp → API Setup | Meta rejects unverified recipients |
| **This POC** | `SEND_ALLOWLIST` in `server/.env` | Returns 403 before calling Meta |

In mock mode `SEND_ALLOWLIST` is optional — omit it to accept any valid E.164.

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
| `RECIPIENT_COOLDOWN_SECONDS` | `300` | Min seconds between sends to same number (Meta floor is 6s) |
| `MESSAGE_TYPE` | `template` | POC live path uses approved templates only; `text` is rejected |
| `WHATSAPP_TEMPLATE_NAME` | `hello_world` | Approved template name. Static templates (e.g. `hello_world`) send without variables. Custom templates (e.g. `advisor_greeting`) fill `components` from `params` or defaults below. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | `en_US` | Must match the approved variant exactly (`en` vs `en_US` matters — check WhatsApp Manager or `GET /{WABA-ID}/message_templates`) |
| `TEMPLATE_PARAM_CUSTOMER_NAME` | `Jane` | Default when request omits `params.customer_name` |
| `TEMPLATE_PARAM_ADVISOR_NAME` | `Alex` | Default when request omits `params.advisor_name` |
| `TEMPLATE_PARAM_BRAND_NAME` | `Example Brand` | Default when request omits `params.brand_name` |
| `WHATSAPP_ACCESS_TOKEN` | — | Required for live (~24h for dashboard temp tokens) |
| `WHATSAPP_PHONE_NUMBER_ID` | — | Numeric ID from dashboard, not display number |
| `WHATSAPP_WABA_ID` | — | Required at startup; not used in the send API call itself |

In live mode the server refuses to start without a non-empty `SEND_ALLOWLIST` and all three Meta vars. Use the same 1–5 numbers you OTP-verified in the Meta test dashboard.

**Mobile** (`mobile/.env`)

| Variable | Default | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `http://localhost:3001` | Backend base URL only — no Meta credentials |

Restart the backend after any `server/.env` change.

## API

Base URL: `http://localhost:3001`. All responses are JSON.

### `GET /health`

```json
{ "ok": true, "sendMode": "mock" }
```

`sendMode` is `"mock"` or `"live"` (matches `SEND_MODE` in `server/.env`).

### `POST /api/send`

Request:

```json
{ "phone": "+85291234567" }
```

Optional template variables (for custom templates such as `advisor_greeting`):

```json
{
  "phone": "+85291234567",
  "params": {
    "customer_name": "Jane",
    "advisor_name": "Alex",
    "brand_name": "Example Brand"
  }
}
```

Phone is E.164 with or without `+` (stripped to digits before Meta). When `params` is omitted, the server uses `TEMPLATE_PARAM_*` env defaults. `hello_world` ignores `params`.

Success (same shape in both modes):

```json
{ "ok": true, "messageId": "wamid.…", "mock": true }
```

| Mode | `messageId` | `mock` |
|---|---|---|
| mock | `wamid.MOCK-…` | `true` |
| live | `wamid.HBgL…` (from Meta) | `false` |

Error:

```json
{ "ok": false, "error": "Human-readable reason." }
```

| Status | When |
|---|---|
| `400` | Invalid/missing phone; CSW closed; POC rejects `MESSAGE_TYPE=text` |
| `401` | Meta token expired or invalid |
| `403` | Not on `SEND_ALLOWLIST`; not on Meta's test allowlist |
| `429` | Cooldown, per-recipient cap, global cap, or Meta rate limit |
| `500` / `502` | Server or unexpected Meta error |

Guards run in order before any Meta call: allowlist → cooldown → per-recipient daily cap → global daily cap.

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

**Send with custom template variables** — set `WHATSAPP_TEMPLATE_NAME=advisor_greeting` in `server/.env` first:

```bash
curl -s -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+85291234567",
    "params": {
      "customer_name": "Jane",
      "advisor_name": "Alex",
      "brand_name": "Example Brand"
    }
  }'
```

## Backend error messages (live mode)

Meta errors are mapped to plain English:

| HTTP | Example `error` | Source |
|---|---|---|
| 401 | WhatsApp access token is expired or invalid… | Meta 190 |
| 403 | Recipient is not on Meta's test allowlist… | Meta |
| 403 | Recipient is not on SEND_ALLOWLIST. | Backend guard |
| 429 | Cooldown active for this recipient. Try again in 296s. | Backend guard |
| 429 | Pair rate limit: wait at least 6 seconds… | Meta 131056 |
| 400 | Customer service window is closed. Use a template… | Meta 131047 |

## Meta limits (at a glance)

| Limit | Value |
|---|---|
| New portfolio — unique recipients / 24h | 250 (portfolio-level) |
| Same recipient — min interval | 6 seconds (Meta); this POC defaults to 300s |
| Throughput | 80 messages/second |
| Test number — OTP-verified recipients | Max 5 |
| Quality rating | Based on 7-day blocks/reports; `Flagged` → tier downgrade; `Restricted` → outbound halted |

Full Meta detail: [Confluence guide](https://vo2-usa.atlassian.net/wiki/x/AQCDHQ).

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
