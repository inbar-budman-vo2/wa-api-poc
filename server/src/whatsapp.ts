import { randomBytes } from "node:crypto";

import type { Config } from "./config.js";
import { appendSendLog } from "./guard.js";

export interface SendResult {
  messageId: string;
  mock: boolean;
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

  throw new Error(
    "Live WhatsApp send is not implemented yet. Set SEND_MODE=mock or complete Step 5.",
  );
}
