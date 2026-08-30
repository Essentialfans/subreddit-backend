import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseTelegramAuthPayload,
  verifyTelegramAuth,
  type TelegramAuthPayload,
} from "@/lib/telegram/verify";

type Mode = "link" | "login";

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  return token;
}

function telegramFields(payload: TelegramAuthPayload) {
  return {
    telegram_id: payload.id,
    telegram_username: payload.username ?? null,
    telegram_first_name: payload.first_name ?? null,
    telegram_photo_url: payload.photo_url ?? null,
    telegram_linked_at: new Date().toISOString(),
    telegram_verified: true,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mode = (body?.mode as Mode) ?? "login";
    const payload = parseTelegramAuthPayload(body?.telegram);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid Telegram payload." },
        { status: 400 }
      );
    }

    const verified = verifyTelegramAuth(payload, getBotToken());
    if (!verified.ok) {
      return NextResponse.json({ error: verified.reason }, { status: 401 });
    }

    if (mode === "link") {
      return handleLink(payload);
    }

    return handleLogin(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Telegram auth failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleLink(payload: TelegramAuthPayload) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in with email before linking Telegram." },
      { status: 401 }
    );
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id, email, telegram_username")
    .eq("telegram_id", payload.id)
    .maybeSingle();

  if (existing && existing.id !== user.id) {
    return NextResponse.json(
      {
        error:
          "This Telegram account is already linked to another AiInstaReels user.",
      },
      { status: 409 }
    );
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .update(telegramFields(payload))
    .eq("id", user.id)
    .select("telegram_id, telegram_username, telegram_verified")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mode: "link",
    profile: {
      telegramId: profile.telegram_id,
      telegramUsername: profile.telegram_username,
      telegramVerified: profile.telegram_verified,
    },
  });
}

async function handleLogin(payload: TelegramAuthPayload) {
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, telegram_username, telegram_verified")
    .eq("telegram_id", payload.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile?.email) {
    return NextResponse.json(
      {
        error:
          "No AiInstaReels account is linked to this Telegram user. Sign up with email first, then link Telegram in Settings.",
      },
      { status: 404 }
    );
  }

  // Refresh username / photo on each Telegram login
  await admin
    .from("profiles")
    .update(telegramFields(payload))
    .eq("id", profile.id);

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: profile.email,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      {
        error:
          linkError?.message ??
          "Could not create a session from Telegram login.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "login",
    tokenHash: linkData.properties.hashed_token,
    email: profile.email,
    telegramUsername: payload.username ?? profile.telegram_username,
  });
}
