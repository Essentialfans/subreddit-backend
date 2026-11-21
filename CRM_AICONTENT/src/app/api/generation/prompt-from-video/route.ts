import { NextResponse } from "next/server";
import { loadKieApiKey, requireUserId } from "@/lib/kie/keys";
import { findPromptLlm, type PromptLlmId } from "@/lib/kie/prompt-llms";
import { findModel } from "@/lib/kie/models";
import { buildPromptFromVideo } from "@/lib/generation/prompt-from-video";

export const runtime = "nodejs";
/** Inventory + ASR + Wan rewrite — allow Fluid Compute to finish the full pass. */
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      sourceVideoUrl?: string;
      keyframeUrls?: string[];
      keyframeTimesSec?: number[];
      creatorId?: string;
      modelName?: string;
      llm?: string;
      videoModelId?: string;
      lookAlike?: boolean;
      durationSec?: number | null;
      aspect?: string | null;
    };

    const sourceVideoUrl = body.sourceVideoUrl?.trim();
    if (!sourceVideoUrl) {
      return NextResponse.json(
        { ok: false, error: "sourceVideoUrl is required" },
        { status: 400 }
      );
    }

    const llmOpt = findPromptLlm(body.llm);
    if (!llmOpt) {
      return NextResponse.json(
        {
          ok: false,
          error: "Pick a prompt LLM: grok-4-7, gemini-4-hydrogen, or claude-opus-5-5",
        },
        { status: 400 }
      );
    }

    const modelName = body.modelName?.trim();
    if (!modelName) {
      return NextResponse.json(
        { ok: false, error: "Select a My Model (creator) first" },
        { status: 400 }
      );
    }

    // Keep order — dense timeline must stay chronological (do not Set-dedupe).
    const keyframeUrls = (body.keyframeUrls ?? []).filter(Boolean);
    if (keyframeUrls.length < 1) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Upload the clip and wait for the full-timeline frames to finish extracting.",
        },
        { status: 400 }
      );
    }
    if (keyframeUrls.length > 60) {
      return NextResponse.json(
        { ok: false, error: "Too many keyframes (max 60)." },
        { status: 400 }
      );
    }

    const videoModel =
      findModel(body.videoModelId || "wan-3-0") ?? findModel("wan-3-0");

    const apiKey = await loadKieApiKey(userId);

    const keyframeTimesSec = (body.keyframeTimesSec ?? [])
      .map((t) => Number(t))
      .filter((t) => Number.isFinite(t) && t >= 0);

    const result = await buildPromptFromVideo({
      apiKey,
      llm: llmOpt.id as PromptLlmId,
      sourceVideoUrl,
      modelName,
      videoModelLabel: videoModel?.label ?? "Wan 3.0",
      lookAlike: Boolean(body.lookAlike),
      keyframeUrls,
      keyframeTimesSec,
      durationSec: body.durationSec ?? null,
      aspect: body.aspect ?? "9:16",
    });

    return NextResponse.json({
      ok: true,
      ...result,
      creatorId: body.creatorId ?? null,
      videoModelId: videoModel?.id ?? "wan-3-0",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
