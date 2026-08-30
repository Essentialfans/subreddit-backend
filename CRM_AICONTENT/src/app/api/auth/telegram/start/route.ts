import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createAuthCode,
  deepLinkForCode,
  getBotUsername,
  type TelegramAuthMode,
} from "@/lib/telegram/deep-link";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode = (body?.mode as TelegramAuthMode) ?? "login";

    if (mode !== "link" && mode !== "login") {
      return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
    }

    let userId: string | null = null;

    if (mode === "link") {
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
      userId = user.id;
    }

    const entry = createAuthCode(mode, userId);

    return NextResponse.json({
      ok: true,
      code: entry.code,
      mode: entry.mode,
      deepLink: deepLinkForCode(entry.code),
      botUsername: getBotUsername(),
      expiresAt: entry.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not start Telegram auth.",
      },
      { status: 500 }
    );
  }
}
