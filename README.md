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

Not required for the scaffold. Backend defaults to port `3001`; the app defaults to `http://localhost:3001`. Override with `PORT` and `EXPO_PUBLIC_API_URL` when needed.
