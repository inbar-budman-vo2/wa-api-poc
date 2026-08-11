import { randomBytes } from "node:crypto";

import type { Config } from "./config.js";
import { appendSendLog } from "./guard.js";

const GRAPH_API_VERSION = "v23.0";

export interface SendResult {
  messageId: string;
  mock: boolean;
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

interface MetaErrorBody {
  error?: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface MetaSuccessBody {
  messages?: Array<{ id: string }>;
}

function mapMetaError(code: number, message: string): WhatsAppError {
  const lower = message.toLowerCase();

  if (
    lower.includes("not in allowed list") ||
    lower.includes("not a valid whatsapp user") ||
    lower.includes("recipient") && lower.includes("allow")
  ) {
    return new WhatsAppError(
      "Recipient is not on Meta's test allowlist. Add and OTP-verify the number in the WhatsApp dashboard.",
      403,
    );
  }

  switch (code) {
    case 190:
      return new WhatsAppError(
        "WhatsApp access token is expired or invalid. Regenerate it in the Meta developer dashboard.",
        401,
      );
    case 100:
      return new WhatsAppError(`Meta rejected the request: ${message}`, 400);
    case 131047:
      return new WhatsAppError(
        "Customer service window is closed. Use a template message for first contact.",
        400,
      );
    case 132001:
      return new WhatsAppError(
        "Template is missing, unapproved, or paused. Check hello_world approval status.",
        400,
      );
    case 131056:
      return new WhatsAppError(
        "Pair rate limit: wait at least 6 seconds before messaging the same recipient again.",
        429,
      );
    case 131049:
      return new WhatsAppError(
        "Meta frequency cap hit for this recipient. Wait 24 hours before retrying.",
        429,
      );
    case 130429:
      return new WhatsAppError(
        "Meta throughput limit reached. Slow down and retry shortly.",
        429,
      );
    default:
      return new WhatsAppError(`Meta API error (${code}): ${message}`, 502);
  }
}

async function sendLiveTemplate(
  phone: string,
  config: Config,
): Promise<SendResult> {
  const phoneNumberId = config.whatsappPhoneNumberId!;
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.whatsappAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: "hello_world",
        language: { code: "en_US" },
      },
    }),
  });

  const data = (await response.json()) as MetaSuccessBody & MetaErrorBody;

  if (!response.ok) {
    if (data.error) {
      throw mapMetaError(data.error.code, data.error.message);
    }
    throw new WhatsAppError(
      `Meta API returned HTTP ${response.status}.`,
      502,
    );
  }

  const messageId = data.messages?.[0]?.id;
  if (!messageId) {
    throw new WhatsAppError(
      "Meta accepted the request but returned no message ID.",
      502,
    );
  }

  console.log(`[live send] to=+${phone} messageId=${messageId}`);

  appendSendLog({
    phone,
    messageId,
    timestamp: new Date().toISOString(),
  });

  return { messageId, mock: false };
}

export async function sendWhatsAppMessage(
  phone: string,
  config: Config,
): Promise<SendResult> {
  if (config.sendMode === "mock") {
    const messageId = `wamid.MOCK-${randomBytes(8).toString("hex")}`;

    console.log(`[mock send] to=+${phone} messageId=${messageId}`);

    appendSendLog({
      phone,
      messageId,
      timestamp: new Date().toISOString(),
    });

    return { messageId, mock: true };
  }

  if (config.messageType === "text") {
    throw new WhatsAppError(
      "Text messages require an open 24-hour customer service window. This POC uses template (hello_world) only.",
      400,
    );
  }

  return sendLiveTemplate(phone, config);
}
