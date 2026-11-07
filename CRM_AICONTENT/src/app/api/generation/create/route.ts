import { NextResponse } from "next/server";
import { createKieTask } from "@/lib/kie/client";
import { loadKieApiKey, requireUserId } from "@/lib/kie/keys";
import { buildKieInput, findModel } from "@/lib/kie/models";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      modelId?: string;
      prompt?: string;
      aspect?: string;
      duration?: number;
      resolution?: string | null;
      imageUrl?: string | null;
      imageUrls?: string[] | null;
      videoUrl?: string | null;
      audioUrl?: string | null;
    };

    const model = body.modelId ? findModel(body.modelId) : undefined;
    if (!model) {
      return NextResponse.json(
        { ok: false, error: "Unknown model" },
        { status: 400 }
      );
    }

    const prompt = body.prompt?.trim() ?? "";
    if (!model.promptOptional && prompt.length < 3) {
      return NextResponse.json(
        { ok: false, error: "Prompt is too short" },
        { status: 400 }
      );
    }

    const imageUrls = [
      ...(body.imageUrls ?? []),
      ...(body.imageUrl ? [body.imageUrl] : []),
    ].filter(Boolean);

    if (model.requiresImage && imageUrls.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `${model.label} needs a reference image — generate one first or paste a URL.`,
        },
        { status: 400 }
      );
    }

    if (model.requiresMotionVideo && !body.videoUrl?.trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: `${model.label} needs a motion-reference video (3–30s) that drives the movement.`,
        },
        { status: 400 }
      );
    }

    if (model.requiresAudio && !body.audioUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: `${model.label} needs an audio URL for lip-sync.`,
        },
        { status: 400 }
      );
    }

    const apiKey = await loadKieApiKey(userId);
    const allowedDurations = model.durations ?? [];
    const requestedDuration = body.duration ?? model.defaultDuration;
    const duration =
      typeof requestedDuration === "number" &&
      allowedDurations.length > 0 &&
      !allowedDurations.includes(requestedDuration)
        ? model.defaultDuration ?? allowedDurations[0]
        : requestedDuration;

    const allowedResolutions = model.resolutions ?? [];
    const requestedResolution =
      body.resolution ?? model.defaultResolution ?? null;
    const resolution =
      requestedResolution &&
      allowedResolutions.length > 0 &&
      !allowedResolutions.includes(requestedResolution)
        ? model.defaultResolution ?? allowedResolutions[0]
        : requestedResolution;

    const payload = buildKieInput({
      model,
      prompt,
      aspect: body.aspect || model.defaultAspect,
      duration,
      resolution,
      imageUrls,
      videoUrl: body.videoUrl,
      audioUrl: body.audioUrl,
    });

    const result = await createKieTask(apiKey, payload);

    return NextResponse.json({
      ok: true,
      taskId: result.taskId,
      mode: model.mode,
      modelId: model.id,
      modelLabel: model.label,
      kieModel: payload.model,
    });
  } catch (error) {
    let message = error instanceof Error ? error.message : "Generation failed";
    if (/this field is required/i.test(message)) {
      message = `kie.ai rejected the request — a required field was missing (${message}). For Motion Control, upload both a source still and a motion-reference video.`;
    } else if (/^internal error$/i.test(message.trim())) {
      message =
        "kie.ai returned Internal Error — usually the still/video URL can’t be fetched, the clip isn’t mp4/mov, the still is over ~5MB, or an unsupported field was sent. Re-upload the still + motion clip and try again.";
    }
    const status =
      message === "Unauthorized"
        ? 401
        : /Add your kie\.ai/i.test(message)
          ? 400
          : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
