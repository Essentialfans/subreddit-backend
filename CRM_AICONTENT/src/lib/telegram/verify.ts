import { createHash, createHmac, timingSafeEqual } from "crypto";

export interface TelegramAuthPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const MAX_AUTH_AGE_SECONDS = 60 * 60 * 24; // 24 hours

export function parseTelegramAuthPayload(
  input: unknown
): TelegramAuthPayload | null {
  if (!input || typeof input !== "object") return null;

  const data = input as Record<string, unknown>;
  const id = Number(data.id);
  const authDate = Number(data.auth_date);
  const hash = typeof data.hash === "string" ? data.hash : "";

  if (!Number.isFinite(id) || !Number.isFinite(authDate) || !hash) {
    return null;
  }

  return {
    id,
    first_name:
      typeof data.first_name === "string" ? data.first_name : undefined,
    last_name: typeof data.last_name === "string" ? data.last_name : undefined,
    username: typeof data.username === "string" ? data.username : undefined,
    photo_url: typeof data.photo_url === "string" ? data.photo_url : undefined,
    auth_date: authDate,
    hash,
  };
}

export function verifyTelegramAuth(
  payload: TelegramAuthPayload,
  botToken: string
): { ok: true } | { ok: false; reason: string } {
  const now = Math.floor(Date.now() / 1000);
  if (now - payload.auth_date > MAX_AUTH_AGE_SECONDS) {
    return { ok: false, reason: "Telegram login expired. Try again." };
  }

  const { hash, ...fields } = payload;
  const checkString = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  try {
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "Invalid Telegram signature." };
    }
  } catch {
    return { ok: false, reason: "Invalid Telegram signature." };
  }

  return { ok: true };
}
