import { NextResponse } from "next/server";
import { validateKieKey } from "@/lib/kie/client";
import {
  deleteKieKey,
  getKieKeyStatus,
  requireUserId,
  saveKieKey,
} from "@/lib/kie/keys";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    const status = await getKieKeyStatus(userId);
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as { apiKey?: string };
    const apiKey = body.apiKey?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "apiKey is required" },
        { status: 400 }
      );
    }

    await validateKieKey(apiKey);
    await saveKieKey(userId, apiKey);
    const status = await getKieKeyStatus(userId);
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await deleteKieKey(userId);
    return NextResponse.json({ ok: true, configured: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
