import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import { loadConfig, validateConfig } from "./config.js";
import { GuardError, normalizePhone, runGuards } from "./guard.js";
import { sendWhatsAppMessage, WhatsAppError } from "./whatsapp.js";

dotenv.config();

const config = loadConfig();

try {
  validateConfig(config);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/send", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    runGuards(phone, config);

    const result = await sendWhatsAppMessage(phone, config);

    res.json({
      ok: true,
      messageId: result.messageId,
      mock: result.mock,
    });
  } catch (err) {
    if (err instanceof GuardError || err instanceof WhatsAppError) {
      res.status(err.statusCode).json({ ok: false, error: err.message });
      return;
    }

    console.error(err);
    res.status(500).json({ ok: false, error: "Internal server error." });
  }
});

const server = app.listen(config.port, () => {
  console.log(
    `Server listening on http://localhost:${config.port} (SEND_MODE=${config.sendMode})`,
  );
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${config.port} is already in use. Stop the other process or set PORT to a different value.`,
    );
    process.exit(1);
  }

  throw err;
});
