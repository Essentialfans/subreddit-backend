import { NextResponse } from "next/server";
import { loadKieApiKey, requireUserId } from "@/lib/kie/keys";
import { enhancePrompt } from "@/lib/generation/prompt";
import { ENHANCE_CHAT_MODEL } from "@/lib/kie/chat";
import { findModel } from "@/lib/kie/models";

export const runtime = "nodejs";

/**
 * Model-specific prompt enhancer.
 * Uses the user's kie.ai key → Gemini 3.8 Flash (openai) chat,
 * with a separate recipe per video/image model (Wan ≠ Kling ≠ Seedance…).
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      mode?: "presets" | "recreate" | "free";
      userText?: string;
      modelName?: string;
      modelId?: string;
      presetHint?: string;
      enhanceWithAi?: boolean;
      refLabels?: string[];
      keepPose?: boolean;
      hasImage?: boolean;
      durationSec?: number | null;
      aspect?: string | null;
    };

    let kieApiKey: string | null = null;
    try {
      kieApiKey = await loadKieApiKey(userId);
    } catch {
      kieApiKey = null;
    }

    const catalog = body.modelId ? findModel(body.modelId) : undefined;

    const result = await enhancePrompt({
      mode: body.mode ?? "free",
      userText: body.userText ?? "",
      modelName: body.modelName,
      modelId: body.modelId ?? catalog?.id,
      presetHint: body.presetHint,
      enhanceWithAi: body.enhanceWithAi ?? true,
      refLabels: body.refLabels,
      keepPose: body.keepPose,
      hasImage: body.hasImage,
      durationSec: body.durationSec ?? catalog?.defaultDuration ?? null,
      aspect: body.aspect ?? catalog?.defaultAspect ?? null,
      kieApiKey,
    });

    return NextResponse.json({
      ok: true,
      prompt: result.prompt,
      provider: result.provider,
      llm: result.provider === "kie-chat" ? ENHANCE_CHAT_MODEL : null,
      recipeId: result.recipeId,
      formulaName: result.formulaName,
      note: result.note,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
