import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getAuthCode,
  syncTelegramClaims,
  telegramProfileFields,
} from "@/lib/telegram/deep-link";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Missing code." }, { status: 400 });
    }

    await syncTelegramClaims();
    const entry = getAuthCode(code);

    if (!entry) {
      return NextResponse.json(
        {
          status: "unknown",
          error: "Code not found or server restarted. Start again.",
        },
        { status: 404 }
      );
    }

    if (entry.status === "expired") {
      return NextResponse.json({ status: "expired" });
    }

    if (entry.status === "pending") {
      return NextResponse.json({
        status: "pending",
        expiresAt: entry.expiresAt,
      });
    }

    if (entry.status !== "claimed" && entry.status !== "consumed") {
      return NextResponse.json({ status: entry.status });
    }

    if (!entry.telegramId) {
      return NextResponse.json(
        { status: "error", error: "Telegram identity missing." },
        { status: 500 }
      );
    }

    // Signup: stop after Telegram claim — account form comes next.
    if (entry.mode === "signup") {
      if (entry.status === "consumed") {
        return NextResponse.json({
          status: "error",
          error: "This Telegram signup code was already used. Start again.",
        });
      }

      const admin = createAdminClient();
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("telegram_id", entry.telegramId)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          {
            status: "error",
            error:
              "This Telegram account already has an AiInstaReels user. Sign in instead.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json({
        status: "completed",
        mode: "signup",
        code: entry.code,
        telegram: {
          id: entry.telegramId,
          username: entry.telegramUsername,
          firstName: entry.telegramFirstName,
        },
      });
    }

    const admin = createAdminClient();
    const fields = telegramProfileFields(entry);

    if (entry.mode === "link") {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || (entry.userId && entry.userId !== user.id)) {
        return NextResponse.json(
          {
            status: "error",
            error: "Sign in again to finish linking Telegram.",
          },
          { status: 401 }
        );
      }

      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("telegram_id", entry.telegramId)
        .maybeSingle();

      if (existing && existing.id !== user.id) {
        return NextResponse.json(
          {
            status: "error",
            error:
              "This Telegram account is already linked to another AiInstaReels user.",
          },
          { status: 409 }
        );
      }

      const { data: profile, error } = await admin
        .from("profiles")
        .update(fields)
        .eq("id", user.id)
        .select("telegram_id, telegram_username, telegram_verified")
        .single();

      if (error) {
        return NextResponse.json(
          { status: "error", error: error.message },
          { status: 500 }
        );
      }

      entry.status = "consumed";
      entry.consumedAt = Date.now();

      return NextResponse.json({
        status: "completed",
        mode: "link",
        profile: {
          telegramId: profile.telegram_id,
          telegramUsername: profile.telegram_username,
          telegramVerified: profile.telegram_verified,
        },
      });
    }

    // login mode
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, email, telegram_username")
      .eq("telegram_id", entry.telegramId)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { status: "error", error: profileError.message },
        { status: 500 }
      );
    }

    if (!profile?.email) {
      return NextResponse.json(
        {
          status: "error",
          error:
            "No AiInstaReels account is linked to this Telegram user. Sign up with Telegram first.",
        },
        { status: 404 }
      );
    }

    await admin.from("profiles").update(fields).eq("id", profile.id);

    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
      });

    if (linkError || !linkData?.properties?.hashed_token) {
      return NextResponse.json(
        {
          status: "error",
          error:
            linkError?.message ??
            "Could not create a session from Telegram login.",
        },
        { status: 500 }
      );
    }

    entry.status = "consumed";
    entry.consumedAt = Date.now();

    return NextResponse.json({
      status: "completed",
      mode: "login",
      tokenHash: linkData.properties.hashed_token,
      email: profile.email,
      telegramUsername: entry.telegramUsername ?? profile.telegram_username,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Could not check Telegram auth status.",
      },
      { status: 500 }
    );
  }
}
