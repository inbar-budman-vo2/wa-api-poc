import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { Config } from "./config.js";

const SEND_LOG_PATH = join(process.cwd(), ".sendlog.json");
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SendLogEntry {
  phone: string;
  messageId: string;
  timestamp: string;
}

interface SendLog {
  sends: SendLogEntry[];
}

export class GuardError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "GuardError";
  }
}

export function normalizePhone(input: unknown): string {
  if (typeof input !== "string") {
    throw new GuardError("Phone must be a string in E.164 format.", 400);
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new GuardError("Phone is required.", 400);
  }

  const digits = trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
  if (!/^\d{7,15}$/.test(digits)) {
    throw new GuardError(
      "Phone must be E.164 format (e.g. +85291234567).",
      400,
    );
  }

  return digits;
}

function normalizeAllowlistEntry(entry: string): string {
  const trimmed = entry.trim();
  return trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
}

function loadSendLog(): SendLog {
  if (!existsSync(SEND_LOG_PATH)) {
    return { sends: [] };
  }

  try {
    const raw = readFileSync(SEND_LOG_PATH, "utf8");
    const parsed = JSON.parse(raw) as SendLog;
    if (!Array.isArray(parsed.sends)) {
      return { sends: [] };
    }
    return parsed;
  } catch {
    return { sends: [] };
  }
}

function saveSendLog(log: SendLog): void {
  writeFileSync(SEND_LOG_PATH, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

export function getRecentSends(withinMs: number): SendLogEntry[] {
  const cutoff = Date.now() - withinMs;
  return loadSendLog().sends.filter(
    (entry) => new Date(entry.timestamp).getTime() >= cutoff,
  );
}

export function appendSendLog(entry: SendLogEntry): void {
  const log = loadSendLog();
  log.sends.push(entry);
  saveSendLog(log);
}

function checkAllowlist(phone: string, config: Config): void {
  if (config.sendMode !== "live" && config.sendAllowlist.length === 0) {
    return;
  }

  const allowed = new Set(
    config.sendAllowlist.map(normalizeAllowlistEntry),
  );

  if (!allowed.has(phone)) {
    throw new GuardError(
      "Recipient is not on SEND_ALLOWLIST.",
      403,
    );
  }
}

function checkCooldown(
  phone: string,
  recentSends: SendLogEntry[],
  config: Config,
): void {
  const lastSend = recentSends
    .filter((entry) => entry.phone === phone)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )[0];

  if (!lastSend) {
    return;
  }

  const elapsedSeconds =
    (Date.now() - new Date(lastSend.timestamp).getTime()) / 1000;

  if (elapsedSeconds < config.recipientCooldownSeconds) {
    const retryAfter = Math.ceil(
      config.recipientCooldownSeconds - elapsedSeconds,
    );
    throw new GuardError(
      `Cooldown active for this recipient. Try again in ${retryAfter}s.`,
      429,
    );
  }
}

function checkRecipientDailyCap(
  phone: string,
  recentSends: SendLogEntry[],
  config: Config,
): void {
  const recipientSends = recentSends.filter((entry) => entry.phone === phone);

  if (recipientSends.length >= config.maxSendsPerRecipientPerDay) {
    throw new GuardError(
      `Daily send cap reached for this recipient (${config.maxSendsPerRecipientPerDay}/day).`,
      429,
    );
  }
}

function checkGlobalDailyCap(
  recentSends: SendLogEntry[],
  config: Config,
): void {
  if (recentSends.length >= config.maxSendsPerDay) {
    throw new GuardError(
      `Global daily send cap reached (${config.maxSendsPerDay}/day).`,
      429,
    );
  }
}

export function runGuards(phone: string, config: Config): void {
  const recentSends = getRecentSends(DAY_MS);

  checkAllowlist(phone, config);
  checkCooldown(phone, recentSends, config);
  checkRecipientDailyCap(phone, recentSends, config);
  checkGlobalDailyCap(recentSends, config);
}
