import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/kie/keys";
import { expandPromptStub } from "@/lib/generation/prompt";

export const runtime = "nodejs";

/** Stub endpoint — swap body for a real LLM later. */
export async function POST(request: Request) {
  try {
    await requireUserId();
    const body = (await request.json()) as {
      mode?: "presets" | "recreate" | "free";
      userText?: string;
      modelName?: string;
      presetHint?: string;
      enhanceWithAi?: boolean;
      refLabels?: string[];
      keepPose?: boolean;
    };

    const expanded = expandPromptStub({
      mode: body.mode ?? "free",
      userText: body.userText ?? "",
      modelName: body.modelName,
      presetHint: body.presetHint,
      enhanceWithAi: body.enhanceWithAi ?? true,
      refLabels: body.refLabels,
      keepPose: body.keepPose,
    });

    return NextResponse.json({
      ok: true,
      provider: "stub",
      prompt: expanded,
      note: "LLM enhancer not wired yet — using identity-aware stub.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
