import cors from "cors";
import dotenv from "dotenv";
import express from "express";

import {
  loadConfig,
  validateConfig,
  type TemplateParams,
} from "./config.js";
import { GuardError, normalizePhone, runGuards } from "./guard.js";
import { sendWhatsAppMessage, WhatsAppError } from "./whatsapp.js";

function resolveTemplateParams(
  body: unknown,
  defaults: TemplateParams,
): TemplateParams {
  const raw =
    body &&
    typeof body === "object" &&
    "params" in body &&
    body.params &&
    typeof body.params === "object"
      ? (body.params as Record<string, unknown>)
      : {};

  const pick = (key: keyof TemplateParams): string => {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    return defaults[key];
  };

  return {
    customer_name: pick("customer_name"),
    advisor_name: pick("advisor_name"),
    brand_name: pick("brand_name"),
  };
}

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
  res.json({ ok: true, sendMode: config.sendMode });
});

app.post("/api/send", async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    runGuards(phone, config);

    const params = resolveTemplateParams(req.body, config.templateParams);
    const result = await sendWhatsAppMessage(phone, config, params);

    res.json({
      ok: true,
      messageId: result.messageId,
      mock: result.mock,
      template: config.whatsappTemplateName,
      language: config.whatsappTemplateLanguage,
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
