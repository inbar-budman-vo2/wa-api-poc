export type SendMode = "mock" | "live";
export type MessageType = "template" | "text";

export interface Config {
  port: number;
  sendMode: SendMode;
  sendAllowlist: string[];
  maxSendsPerDay: number;
  maxSendsPerRecipientPerDay: number;
  recipientCooldownSeconds: number;
  messageType: MessageType;
  whatsappAccessToken: string | undefined;
  whatsappPhoneNumberId: string | undefined;
  whatsappWabaId: string | undefined;
}

function parseSendMode(value: string | undefined): SendMode {
  if (!value || value === "mock") {
    return "mock";
  }
  if (value === "live") {
    return "live";
  }
  throw new Error(`Invalid SEND_MODE "${value}". Expected "mock" or "live".`);
}

function parseMessageType(value: string | undefined): MessageType {
  if (!value || value === "template") {
    return "template";
  }
  if (value === "text") {
    return "text";
  }
  throw new Error(
    `Invalid MESSAGE_TYPE "${value}". Expected "template" or "text".`,
  );
}

function parseAllowlist(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name} "${value}". Expected a non-negative integer.`);
  }

  return parsed;
}

export function loadConfig(): Config {
  return {
    port: parsePositiveInt(process.env.PORT, 3001, "PORT"),
    sendMode: parseSendMode(process.env.SEND_MODE),
    sendAllowlist: parseAllowlist(process.env.SEND_ALLOWLIST),
    maxSendsPerDay: parsePositiveInt(
      process.env.MAX_SENDS_PER_DAY,
      20,
      "MAX_SENDS_PER_DAY",
    ),
    maxSendsPerRecipientPerDay: parsePositiveInt(
      process.env.MAX_SENDS_PER_RECIPIENT_PER_DAY,
      3,
      "MAX_SENDS_PER_RECIPIENT_PER_DAY",
    ),
    recipientCooldownSeconds: parsePositiveInt(
      process.env.RECIPIENT_COOLDOWN_SECONDS,
      300,
      "RECIPIENT_COOLDOWN_SECONDS",
    ),
    messageType: parseMessageType(process.env.MESSAGE_TYPE),
    whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    whatsappWabaId: process.env.WHATSAPP_WABA_ID,
  };
}

export function validateConfig(config: Config): void {
  if (config.sendMode === "live" && config.sendAllowlist.length === 0) {
    throw new Error(
      "SEND_MODE=live requires a non-empty SEND_ALLOWLIST. Refusing to start.",
    );
  }
}
