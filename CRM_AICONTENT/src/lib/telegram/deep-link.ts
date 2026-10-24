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

export type TelegramUpdate = {
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

const CODES_BUCKET = "telegram-auth-codes";

type GlobalTelegramState = {
  codes: Map<string, TelegramPendingCode>;
};

const globalForTelegram = globalThis as unknown as {
  __aiinstareelsTelegram?: GlobalTelegramState;
};

function state(): GlobalTelegramState {
  if (!globalForTelegram.__aiinstareelsTelegram) {
    globalForTelegram.__aiinstareelsTelegram = {
      codes: new Map(),
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
  if (!username) {
    throw new Error("NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is not configured");
  }
  return username.replace(/^@/, "");
}

function objectPath(code: string) {
  return `${code}.json`;
}

async function persistCode(entry: TelegramPendingCode) {
  const admin = createAdminClient();
  const body = JSON.stringify(entry);
  const path = objectPath(entry.code);

  // Durable store: private Storage object (works without SQL table).
  const { error: uploadError } = await admin.storage
    .from(CODES_BUCKET)
    .upload(path, body, {
      contentType: "application/json",
      upsert: true,
    });

  if (uploadError) {
    // Ensure bucket exists, then retry once.
    await admin.storage.createBucket(CODES_BUCKET, { public: false }).catch(
      () => undefined
    );
    const { error: retryError } = await admin.storage
      .from(CODES_BUCKET)
      .upload(path, body, {
        contentType: "application/json",
        upsert: true,
      });
    if (retryError) {
      throw new Error(retryError.message);
    }
  }

  // Optional mirror into SQL table if it exists (ignore failures).
  await admin
    .from("telegram_auth_codes")
    .upsert({
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
    })
    .then(() => undefined)
    .catch(() => undefined);
}

async function loadCodeFromStorage(
  code: string
): Promise<TelegramPendingCode | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(CODES_BUCKET)
    .download(objectPath(code));

  if (error || !data) {
    return null;
  }

  const text = await data.text();
  const parsed = JSON.parse(text) as TelegramPendingCode;
  return parsed;
}

export async function createAuthCode(
  mode: TelegramAuthMode,
  userId: string | null
): Promise<TelegramPendingCode> {
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
  await persistCode(entry);
  return entry;
}

export async function getAuthCode(
  code: string
): Promise<TelegramPendingCode | null> {
  let entry = state().codes.get(code) ?? null;

  if (!entry) {
    entry = await loadCodeFromStorage(code);
    if (entry) {
      state().codes.set(code, entry);
    }
  }

  if (!entry) return null;

  if (entry.status === "pending" && Date.now() > entry.expiresAt) {
    entry.status = "expired";
    await persistCode(entry).catch(() => undefined);
  }

  return entry;
}

export function deepLinkForCode(code: string) {
  return `https://t.me/${getBotUsername()}?start=${code}`;
}

export async function telegramApi<T>(
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

function replyTextFor(entry: TelegramPendingCode) {
  const usernameLabel = entry.telegramUsername
    ? `@${entry.telegramUsername}`
    : entry.telegramFirstName ?? "there";

  if (entry.mode === "link") {
    return `✅ Linked to AiInstaReels as ${usernameLabel}.\nReturn to the app — it should update automatically.`;
  }
  if (entry.mode === "signup") {
    return `✅ Telegram verified as ${usernameLabel}.\nReturn to the app and finish creating your account (name, email, password).`;
  }
  return `✅ Telegram verified as ${usernameLabel}.\nReturn to the app to finish signing in.`;
}

export async function claimCodeFromStart(
  code: string,
  from: NonNullable<NonNullable<TelegramUpdate["message"]>["from"]>
): Promise<TelegramPendingCode | null> {
  const entry = await getAuthCode(code);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    entry.status = "expired";
    await persistCode(entry).catch(() => undefined);
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
  state().codes.set(entry.code, entry);
  await persistCode(entry);
  return entry;
}

/** Handle one Telegram update (webhook). Always tries to reply helpfully. */
export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  const text = message?.text;
  const from = message?.from;
  const chatId = message?.chat?.id;
  if (!text || !from || !chatId) return;

  const match = text.trim().match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (!match) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "Open AiInstaReels and use Sign up / Sign in → Telegram. That creates a one-time link for this bot.",
    }).catch(() => undefined);
    return;
  }

  const code = match[1]?.trim();
  if (!code) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "To verify, start from the AiInstaReels website (Sign up or Sign in → Continue with Telegram). Don't send /start here alone.",
    }).catch(() => undefined);
    return;
  }

  try {
    const entry = await claimCodeFromStart(code, from);
    if (!entry) {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "This link expired or is invalid. Go back to AiInstaReels and generate a new Telegram link.",
      }).catch(() => undefined);
      return;
    }

    if (entry.status === "expired") {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "This verification link expired. Generate a new one on AiInstaReels.",
      }).catch(() => undefined);
      return;
    }

    if (entry.status === "consumed") {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: "This link was already used. Sign in on AiInstaReels, or generate a new link if needed.",
      }).catch(() => undefined);
      return;
    }

    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: replyTextFor(entry),
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Verification failed temporarily.";
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: `Could not verify right now (${msg}). Resume Supabase if paused, then try a new link from the website.`,
    }).catch(() => undefined);
  }
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

export async function ensureTelegramWebhook(publicBaseUrl: string) {
  const url = `${publicBaseUrl.replace(/\/$/, "")}/api/auth/telegram/webhook`;
  await telegramApi("setWebhook", {
    url,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  return url;
}
