import { NextResponse } from "next/server";
import {
  handleTelegramUpdate,
  type TelegramUpdate,
} from "@/lib/telegram/deep-link";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const update = (await request.json()) as TelegramUpdate;
    await handleTelegramUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("telegram webhook error", error);
    // Always 200 so Telegram doesn't retry forever on app bugs.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "telegram-webhook",
  });
}
