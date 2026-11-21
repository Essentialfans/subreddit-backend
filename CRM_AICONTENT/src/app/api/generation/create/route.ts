import { NextResponse } from "next/server";
import { createKieTask } from "@/lib/kie/client";
import { rehostToKie } from "@/lib/kie/files";
import { loadKieApiKey, requireUserId } from "@/lib/kie/keys";
import { buildKieInput, findModel } from "@/lib/kie/models";

export const runtime = "nodejs";

const WAN_STILL_MAX = 5 * 1024 * 1024;

async function headContentLength(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    return len ? Number(len) : null;
  } catch {
    return null;
  }
}

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

    let imageUrls = [
      ...(body.imageUrls ?? []),
      ...(body.imageUrl ? [body.imageUrl] : []),
    ].filter(Boolean) as string[];

    if (model.requiresImage && imageUrls.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `${model.label} needs a reference image — generate one first or paste a URL.`,
        },
        { status: 400 }
      );
    }

    let videoUrl = body.videoUrl?.trim() || null;

    if (model.requiresMotionVideo && !videoUrl) {
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

    // Wan Animate Move hard-caps stills at 5MB — generated PNGs are often larger.
    if (model.id === "wan-animate-move" && imageUrls[0]) {
      const bytes = await headContentLength(imageUrls[0]);
      if (bytes && bytes > WAN_STILL_MAX) {
        return NextResponse.json(
          {
            ok: false,
            error: `Wan Animate Move allows stills up to 5MB; this one is ${(
              bytes /
              (1024 * 1024)
            ).toFixed(1)}MB. Wait for auto-compress on the client, or re-upload a smaller JPEG.`,
          },
          { status: 400 }
        );
      }
    }

    const apiKey = await loadKieApiKey(userId);

    // Motion APIs are picky about fetching arbitrary hosts — rehost onto kie tempfile CDN.
    if (model.requiresMotionVideo) {
      const rehostedImages: string[] = [];
      for (const [i, url] of imageUrls.entries()) {
        rehostedImages.push(
          await rehostToKie({
            apiKey,
            fileUrl: url,
            uploadPath: `ainstareel/${userId}/stills`,
            fileName: `still-${i}.jpg`,
          })
        );
      }
      imageUrls = rehostedImages;
      if (videoUrl) {
        videoUrl = await rehostToKie({
          apiKey,
          fileUrl: videoUrl,
          uploadPath: `ainstareel/${userId}/motion`,
          fileName: "motion.mp4",
        });
      }
    }

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
      videoUrl,
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
        "kie.ai returned Internal Error — for Wan Animate the still must be ≤5MB (generated PNGs are often larger; refresh and retry so we auto-compress), and both still + mp4 must be publicly fetchable.";
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
