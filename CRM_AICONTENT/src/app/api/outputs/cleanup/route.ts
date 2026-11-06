import { NextResponse } from "next/server";
import { purgeExpiredOutputs } from "@/lib/outputs/store";

export const runtime = "nodejs";

/**
 * Purge outputs past their 3-day TTL.
 * Callable by cron or manually; no auth required beyond knowing the URL
 * (only deletes already-expired rows).
 */
export async function POST() {
  try {
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const n = await purgeExpiredOutputs(100);
      total += n;
      if (n < 100) break;
    }
    return NextResponse.json({ ok: true, purged: total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
