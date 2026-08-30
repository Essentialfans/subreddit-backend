import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type TelegramAuthMode = "link" | "login" | "signup";
export type TelegramCodeStatus =
  | "pending"
  | "claimed"
  | "consumed"
  | "expired";

export interface TelegramPendingCode {
  code: string;
  mode: TelegramAuthMode;
  userId: string | null;
  status: TelegramCodeStatus;
  telegramId: number | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramPhotoUrl: string | null;
  createdAt: number;
  expiresAt: number;
  claimedAt: number | null;
  consumedAt: number | null;
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    from?: {
      id: number;
      username?: string;
      first_name?: string;
    };
    chat?: { id: number };
  };
};

type GlobalTelegramState = {
  codes: Map<string, TelegramPendingCode>;
  updateOffset: number;
};

const globalForTelegram = globalThis as unknown as {
  __aiinstareelsTelegram?: GlobalTelegramState;
};

function state(): GlobalTelegramState {
  if (!globalForTelegram.__aiinstareelsTelegram) {
    globalForTelegram.__aiinstareelsTelegram = {
      codes: new Map(),
      updateOffset: 0,
    };
  }
  return globalForTelegram.__aiinstareelsTelegram;
}

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

export function getBotUsername() {
  const username = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!username) throw new Error("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is not configured");
  return username.replace(/^@/, "");
}

export function createAuthCode(
  mode: TelegramAuthMode,
  userId: string | null
): TelegramPendingCode {
  const code = randomBytes(16).toString("hex");
  const now = Date.now();
  const entry: TelegramPendingCode = {
    code,
    mode,
    userId,
    status: "pending",
    telegramId: null,
    telegramUsername: null,
    telegramFirstName: null,
    telegramPhotoUrl: null,
    createdAt: now,
    expiresAt: now + 10 * 60 * 1000,
    claimedAt: null,
    consumedAt: null,
  };
  state().codes.set(code, entry);
  void persistCode(entry).catch(() => {
    // Table may not exist yet — in-memory still works locally.
  });
  return entry;
}

export function getAuthCode(code: string): TelegramPendingCode | null {
  const entry = state().codes.get(code) ?? null;
  if (!entry) return null;
  if (entry.status === "pending" && Date.now() > entry.expiresAt) {
    entry.status = "expired";
  }
  return entry;
}

export function deepLinkForCode(code: string) {
  return `https://t.me/${getBotUsername()}?start=${code}`;
}

async function persistCode(entry: TelegramPendingCode) {
  const admin = createAdminClient();
  await admin.from("telegram_auth_codes").upsert({
    code: entry.code,
    mode: entry.mode,
    user_id: entry.userId,
    telegram_id: entry.telegramId,
    telegram_username: entry.telegramUsername,
    telegram_first_name: entry.telegramFirstName,
    telegram_photo_url: entry.telegramPhotoUrl,
    status: entry.status,
    created_at: new Date(entry.createdAt).toISOString(),
    expires_at: new Date(entry.expiresAt).toISOString(),
    claimed_at: entry.claimedAt
      ? new Date(entry.claimedAt).toISOString()
      : null,
    consumed_at: entry.consumedAt
      ? new Date(entry.consumedAt).toISOString()
      : null,
  });
}

async function telegramApi<T>(
  method: string,
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${getBotToken()}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }
  );
  const json = (await response.json()) as {
    ok: boolean;
    result?: T;
    description?: string;
  };
  if (!json.ok) {
    throw new Error(json.description ?? `Telegram API ${method} failed`);
  }
  return json.result as T;
}

function claimFromStartText(
  text: string,
  from: NonNullable<NonNullable<TelegramUpdate["message"]>["from"]>
) {
  const match = text.trim().match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (!match?.[1]) return null;
  const code = match[1].trim();
  const entry = state().codes.get(code);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    entry.status = "expired";
    return entry;
  }
  if (entry.status !== "pending" && entry.status !== "claimed") {
    return entry;
  }

  entry.status = "claimed";
  entry.telegramId = from.id;
  entry.telegramUsername = from.username ?? null;
  entry.telegramFirstName = from.first_name ?? null;
  entry.telegramPhotoUrl = null;
  entry.claimedAt = Date.now();
  void persistCode(entry).catch(() => undefined);
  return entry;
}

export async function syncTelegramClaims() {
  // Ensure getUpdates works (webhook would block it).
  try {
    await telegramApi("deleteWebhook", { drop_pending_updates: false });
  } catch {
    // ignore
  }

  const s = state();
  const updates = await telegramApi<TelegramUpdate[]>("getUpdates", {
    offset: s.updateOffset || undefined,
    timeout: 0,
    allowed_updates: ["message"],
  });

  for (const update of updates) {
    s.updateOffset = Math.max(s.updateOffset, update.update_id + 1);
    const message = update.message;
    const text = message?.text;
    const from = message?.from;
    if (!text || !from) continue;

    const entry = claimFromStartText(text, from);
    if (!entry || entry.status !== "claimed" || !message.chat?.id) continue;

    const usernameLabel = entry.telegramUsername
      ? `@${entry.telegramUsername}`
      : entry.telegramFirstName ?? "there";

    await telegramApi("sendMessage", {
      chat_id: message.chat.id,
      text:
        entry.mode === "link"
          ? `✅ Linked to AiInstaReels as ${usernameLabel}.\nReturn to the app — it should update automatically.`
          : entry.mode === "signup"
            ? `✅ Telegram verified as ${usernameLabel}.\nReturn to the app and finish creating your account (name, email, password).`
            : `✅ Telegram verified as ${usernameLabel}.\nReturn to the app to finish signing in.`,
    }).catch(() => undefined);
  }
}

export async function consumeClaimedCode(code: string) {
  const entry = getAuthCode(code);
  if (!entry) return null;
  if (entry.status === "pending") {
    await syncTelegramClaims();
  }
  const latest = getAuthCode(code);
  if (!latest) return null;
  if (latest.status === "claimed") {
    latest.status = "consumed";
    latest.consumedAt = Date.now();
    void persistCode(latest).catch(() => undefined);
  }
  return latest;
}

export function telegramProfileFields(entry: TelegramPendingCode) {
  if (!entry.telegramId) {
    throw new Error("Telegram identity missing on claimed code");
  }
  return {
    telegram_id: entry.telegramId,
    telegram_username: entry.telegramUsername,
    telegram_first_name: entry.telegramFirstName,
    telegram_photo_url: entry.telegramPhotoUrl,
    telegram_linked_at: new Date().toISOString(),
    telegram_verified: true,
  };
}
