# wa-api-poc

WhatsApp Business API proof of concept — Express backend + Expo mobile app.

## Quick start

Two terminals. Load the app in Expo Go manually (do not press `i` in the Metro terminal — it crashes Expo CLI on this setup).

### Terminal 1 — backend

```bash
cd server && npm run dev
```

Runs on **http://localhost:3001**. Check:

```bash
curl http://localhost:3001/health
```

### Terminal 2 — mobile

```bash
cd mobile && npm start
```

Metro on **http://localhost:8081**. Check:

```bash
curl http://127.0.0.1:8081/status
```

### Simulator

1. Open **Simulator** (Spotlight → Simulator)
2. Open **Expo Go**
3. Enter URL manually: `exp://127.0.0.1:8081`
4. Tap **Check backend health** — should show `{"ok":true}`

Optional (Metro running, Simulator open):

```bash
cd mobile && npm run open:ios
```

## Port in use?

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN   # backend
lsof -nP -iTCP:8081 -sTCP:LISTEN   # Metro
kill <PID>
```

## Env vars

Copy `server/.env.example` to `server/.env` when you need to override defaults. Mock mode works out of the box with no `.env` file.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Backend listen port |
| `SEND_MODE` | `mock` | `mock` (no Meta traffic) or `live` (Step 5+) |
| `SEND_ALLOWLIST` | _(empty)_ | Comma-separated E.164 numbers — see **When is allowlist required?** below |
| `MAX_SENDS_PER_DAY` | `20` | Global daily send cap |
| `MAX_SENDS_PER_RECIPIENT_PER_DAY` | `3` | Per-recipient daily send cap |
| `RECIPIENT_COOLDOWN_SECONDS` | `300` | Minimum seconds between sends to the same number |
| `MESSAGE_TYPE` | `template` | `template` or `text` (used in live mode, Step 5+) |

Meta credentials (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`) are only required for `SEND_MODE=live`. See `server/.env.example`.

Mobile: `EXPO_PUBLIC_API_URL` defaults to `http://localhost:3001`.

### When is `SEND_ALLOWLIST` required?

| Scenario | Required? | Behavior |
|---|---|---|
| `SEND_MODE=mock`, allowlist **unset/empty** | No | Any valid E.164 number can be sent (mock only) |
| `SEND_MODE=mock`, allowlist **set** | Optional, but enforced if set | Only listed numbers succeed — useful to mirror live behavior locally |
| `SEND_MODE=live` | **Yes** | Server refuses to start without a non-empty allowlist; only listed numbers are sent |

In live mode, use the same 1–5 numbers you OTP-verified in the Meta test dashboard.

## API reference

Base URL: `http://localhost:3001` (or whatever `PORT` is set to).

All endpoints return JSON. `POST /api/send` expects `Content-Type: application/json`.

### `GET /health`

Liveness check. No query params or request body.

**Response `200`**

```json
{ "ok": true }
```

### `POST /api/send`

Send a WhatsApp message. In mock mode (default) nothing is sent to Meta — the server logs the send and returns a fake message id.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `phone` | string | yes | Recipient in E.164 format, e.g. `"+85291234567"` |

Example:

```json
{ "phone": "+85291234567" }
```

The `+` prefix is optional; digits only (`85291234567`) also work. Must be 7–15 digits after normalization.

**Success response `200`**

```json
{
  "ok": true,
  "messageId": "wamid.MOCK-a1b2c3d4e5f67890",
  "mock": true
}
```

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | Always `true` on success |
| `messageId` | string | WhatsApp message id (`wamid.MOCK-…` in mock mode) |
| `mock` | boolean | `true` when no Meta API call was made |

**Error response `4xx` / `5xx`**

```json
{ "ok": false, "error": "Human-readable reason." }
```

| Status | When |
|---|---|
| `400` | Missing/invalid `phone` (not a string, empty, or not E.164) |
| `403` | Recipient not on `SEND_ALLOWLIST` (enforced in live mode; also enforced in mock mode if allowlist is set) |
| `429` | Cooldown active, per-recipient daily cap, or global daily cap |
| `500` | Unexpected server error |

Example cooldown error:

```json
{ "ok": false, "error": "Cooldown active for this recipient. Try again in 296s." }
```

## Verify Step 4 (mock send)

No Meta account or `.env` file needed. Default is `SEND_MODE=mock`.

### 1. Start the backend

```bash
cd server && npm run dev
```

Confirm startup log shows `SEND_MODE=mock`.

### 2. Health check

```bash
curl http://localhost:3001/health
# → {"ok":true}
```

### 3. Successful mock send

```bash
curl -s -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"+85291234567"}'
```

Expected: `200` with `"ok":true`, `"mock":true`, and a `"messageId"` starting with `wamid.MOCK-`.

### 4. Cooldown blocks a rapid repeat

Run the same curl again immediately:

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"+85291234567"}'
```

Expected: `429` with `"Cooldown active for this recipient…"`.

**Tip:** To test cooldown faster, add `RECIPIENT_COOLDOWN_SECONDS=5` to `server/.env` and restart.

### 5. Confirm side effects (optional)

- Server console logs: `[mock send] to=+85291234567 messageId=wamid.MOCK-…`
- Send log written: `server/.sendlog.json` (gitignored — contains real phone numbers)

### 6. Invalid phone (optional)

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"not-a-number"}'
```

Expected: `400` with `"Phone must be E.164 format…"`.

**Note:** With no `SEND_ALLOWLIST` in `server/.env`, mock sends work for any valid E.164 number. If you set it, only listed numbers succeed.

## Verify Step 5 (live send)

Requires Meta credentials from [WhatsApp → API Setup](https://developers.facebook.com/) (Step 2). On Meta's **test number**, OTP-verify each recipient in the dashboard before API sends work — max 5. Backend `SEND_ALLOWLIST` is separate and does not replace Meta's list.

### 1. Configure `server/.env`

```bash
SEND_MODE=live
SEND_ALLOWLIST=+15551234567          # same number(s) OTP-verified in Meta dashboard
WHATSAPP_ACCESS_TOKEN=EAA...         # temporary token (~24 h); regenerate when expired
WHATSAPP_PHONE_NUMBER_ID=...         # numeric ID from API Setup — not the display number
WHATSAPP_WABA_ID=...
```

Restart the backend after any `.env` change. Confirm startup log shows `SEND_MODE=live`.

### 2. Live send

Use a number from both Meta's dashboard allowlist and `SEND_ALLOWLIST`:

```bash
curl -s -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"+15551234567"}'
```

Expected: `200` with a real WhatsApp message id and `"mock":false`:

```json
{
  "ok": true,
  "messageId": "wamid.HBgLMTU1NTEyMzQ1NjcVAgARGBI5...",
  "mock": false
}
```

`hello_world` should arrive on the recipient's phone. Server console: `[live send] to=+15551234567 messageId=wamid.…`

### 3. Common live errors

| Response | Likely cause |
|---|---|
| `"WhatsApp access token is expired or invalid…"` | Regenerate token in API Setup (error 190) |
| `"Recipient is not on Meta's test allowlist…"` | Add and OTP-verify the number in the dashboard first |
| `"Recipient is not on SEND_ALLOWLIST."` | Add the number to `SEND_ALLOWLIST` in `.env` |
| `"Cooldown active for this recipient…"` | Guardrail working — wait or lower `RECIPIENT_COOLDOWN_SECONDS` for testing |
