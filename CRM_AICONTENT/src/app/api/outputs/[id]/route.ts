import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/kie/keys";
import { deleteUserOutput } from "@/lib/outputs/store";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing id" },
        { status: 400 }
      );
    }
    await deleteUserOutput(userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
