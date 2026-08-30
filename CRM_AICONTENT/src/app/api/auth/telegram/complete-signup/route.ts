import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthCode,
  syncTelegramClaims,
  telegramProfileFields,
} from "@/lib/telegram/deep-link";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = typeof body?.code === "string" ? body.code : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!code || !name || !email || !password) {
      return NextResponse.json(
        { error: "Code, name, email, and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    await syncTelegramClaims();
    const entry = getAuthCode(code);

    if (!entry || entry.mode !== "signup") {
      return NextResponse.json(
        { error: "Invalid signup code. Start Telegram verification again." },
        { status: 400 }
      );
    }

    if (entry.status === "expired" || Date.now() > entry.expiresAt) {
      entry.status = "expired";
      return NextResponse.json(
        { error: "Telegram verification expired. Start again." },
        { status: 400 }
      );
    }

    if (entry.status !== "claimed" || !entry.telegramId) {
      return NextResponse.json(
        { error: "Finish Telegram verification before creating your account." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const fields = telegramProfileFields(entry);

    const { data: existingTelegram } = await admin
      .from("profiles")
      .select("id")
      .eq("telegram_id", entry.telegramId)
      .maybeSingle();

    if (existingTelegram) {
      return NextResponse.json(
        {
          error:
            "This Telegram account already has an AiInstaReels user. Sign in instead.",
        },
        { status: 409 }
      );
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name,
        },
      });

    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message ?? "Could not create account." },
        { status: 400 }
      );
    }

    // Profile may be created by trigger; upsert to be safe.
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: created.user.id,
        full_name: name,
        email,
        ...fields,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      return NextResponse.json(
        {
          error: `Account created but Telegram link failed: ${profileError.message}`,
        },
        { status: 500 }
      );
    }

    entry.status = "consumed";
    entry.consumedAt = Date.now();

    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

    if (linkError || !linkData?.properties?.hashed_token) {
      return NextResponse.json({
        ok: true,
        needsSignIn: true,
        email,
        telegramUsername: entry.telegramUsername,
        message:
          "Account created. Sign in with your email and password.",
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "signup",
      tokenHash: linkData.properties.hashed_token,
      email,
      telegramUsername: entry.telegramUsername,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Signup failed.",
      },
      { status: 500 }
    );
  }
}
