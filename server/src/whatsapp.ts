import { randomBytes } from "node:crypto";

import type { Config, TemplateParams } from "./config.js";
import { appendSendLog } from "./guard.js";

const GRAPH_API_VERSION = "v25.0";
const STATIC_TEMPLATES = new Set(["hello_world"]);

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
    error_data?: {
      details?: string;
    };
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
    (lower.includes("recipient") && lower.includes("allow"))
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
        "Template is missing, unapproved, or paused. Check template name, language, and approval status.",
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

function buildTemplatePayload(
  config: Config,
  params: TemplateParams,
): Record<string, unknown> {
  const template: Record<string, unknown> = {
    name: config.whatsappTemplateName,
    language: { code: config.whatsappTemplateLanguage },
  };

  if (!STATIC_TEMPLATES.has(config.whatsappTemplateName)) {
    template.components = [
      {
        type: "body",
        parameters: [
          {
            type: "text",
            parameter_name: "customer_name",
            text: params.customer_name,
          },
          {
            type: "text",
            parameter_name: "advisor_name",
            text: params.advisor_name,
          },
          {
            type: "text",
            parameter_name: "brand_name",
            text: params.brand_name,
          },
        ],
      },
    ];
  }

  return template;
}

async function sendLiveTemplate(
  phone: string,
  config: Config,
  params: TemplateParams,
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
      template: buildTemplatePayload(config, params),
    }),
  });

  const data = (await response.json()) as MetaSuccessBody & MetaErrorBody;

  if (!response.ok) {
    if (data.error) {
      const details = data.error.error_data?.details;
      if (details) {
        throw mapMetaError(
          data.error.code,
          `${data.error.message} (${details})`,
        );
      }
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

  console.log(
    `[live send] to=+${phone} template=${config.whatsappTemplateName} messageId=${messageId}`,
  );

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
  params: TemplateParams,
): Promise<SendResult> {
  if (config.sendMode === "mock") {
    const messageId = `wamid.MOCK-${randomBytes(8).toString("hex")}`;

    const paramSuffix = STATIC_TEMPLATES.has(config.whatsappTemplateName)
      ? ""
      : ` params=${JSON.stringify(params)}`;
    console.log(
      `[mock send] to=+${phone} template=${config.whatsappTemplateName}${paramSuffix} messageId=${messageId}`,
    );

    appendSendLog({
      phone,
      messageId,
      timestamp: new Date().toISOString(),
    });

    return { messageId, mock: true };
  }

  if (config.messageType === "text") {
    throw new WhatsAppError(
      "Text messages require an open 24-hour customer service window. This POC uses approved templates only.",
      400,
    );
  }

  return sendLiveTemplate(phone, config, params);
}
