import { NextResponse } from "next/server";
import { createKieTask } from "@/lib/kie/client";
import { rehostToKie } from "@/lib/kie/files";
import { loadKieApiKey, requireUserId } from "@/lib/kie/keys";
import { buildKieInput, findModel, isWan3Family } from "@/lib/kie/models";
import { sealWanReferencePromptForApi } from "@/lib/generation/prompt-recipes";

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
      lastFrameUrl?: string | null;
      videoUrl?: string | null;
      referenceVideoUrls?: string[] | null;
      referenceAudioUrls?: string[] | null;
      audioUrl?: string | null;
      modelName?: string | null;
    };

    const model = body.modelId ? findModel(body.modelId) : undefined;
    if (!model) {
      return NextResponse.json(
        { ok: false, error: "Unknown model" },
        { status: 400 }
      );
    }

    let prompt = body.prompt?.trim() ?? "";
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
    if (
      (model.id === "wan-animate-move" ||
        model.id === "wan-animate-replace") &&
      imageUrls[0]
    ) {
      const bytes = await headContentLength(imageUrls[0]);
      if (bytes && bytes > WAN_STILL_MAX) {
        return NextResponse.json(
          {
            ok: false,
            error: `Wan Animate allows stills up to 5MB; this one is ${(
              bytes /
              (1024 * 1024)
            ).toFixed(1)}MB. Wait for auto-compress on the client, or re-upload a smaller JPEG.`,
          },
          { status: 400 }
        );
      }
    }

    let referenceVideoUrls = [
      ...new Set(
        (body.referenceVideoUrls ?? [])
          .map((u) => (typeof u === "string" ? u.trim() : ""))
          .filter(Boolean)
      ),
    ].slice(0, model.maxReferenceVideos ?? 5);

    let referenceAudioUrls = [
      ...new Set(
        (body.referenceAudioUrls ?? [])
          .map((u) => (typeof u === "string" ? u.trim() : ""))
          .filter(Boolean)
      ),
    ].slice(0, model.maxReferenceAudios ?? 5);

    let lastFrameUrl = body.lastFrameUrl?.trim() || null;

    if (referenceVideoUrls.length && !model.supportsReferenceMedia) {
      return NextResponse.json(
        {
          ok: false,
          error: `${model.label} does not support reference videos — use Wan 3.0 / Prime, or Motion Control.`,
        },
        { status: 400 }
      );
    }

    if (referenceAudioUrls.length && !model.maxReferenceAudios) {
      return NextResponse.json(
        {
          ok: false,
          error: `${model.label} does not support reference audio — use Wan 3.0 / Prime with @Audio1.`,
        },
        { status: 400 }
      );
    }

    if (lastFrameUrl && !model.supportsReferenceMedia) {
      return NextResponse.json(
        {
          ok: false,
          error: `${model.label} does not support an end frame — use Wan 3.0 / Prime.`,
        },
        { status: 400 }
      );
    }

    if (lastFrameUrl && !imageUrls[0]) {
      return NextResponse.json(
        {
          ok: false,
          error: "End frame needs a start frame first.",
        },
        { status: 400 }
      );
    }

    // kie: reference_* cannot mix with first/last frame
    if (
      (referenceVideoUrls.length || referenceAudioUrls.length) &&
      lastFrameUrl
    ) {
      lastFrameUrl = null;
    }

    const apiKey = await loadKieApiKey(userId);

    // Motion / Wan reference APIs are picky about fetching arbitrary hosts —
    // rehost onto kie tempfile CDN.
    if (model.requiresMotionVideo || model.supportsReferenceMedia) {
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
      if (lastFrameUrl) {
        lastFrameUrl = await rehostToKie({
          apiKey,
          fileUrl: lastFrameUrl,
          uploadPath: `ainstareel/${userId}/stills`,
          fileName: "end-frame.jpg",
        });
      }
      if (videoUrl) {
        videoUrl = await rehostToKie({
          apiKey,
          fileUrl: videoUrl,
          uploadPath: `ainstareel/${userId}/motion`,
          fileName: "motion.mp4",
        });
      }
      if (referenceVideoUrls.length) {
        const rehostedVideos: string[] = [];
        for (const [i, url] of referenceVideoUrls.entries()) {
          rehostedVideos.push(
            await rehostToKie({
              apiKey,
              fileUrl: url,
              uploadPath: `ainstareel/${userId}/ref-videos`,
              fileName: `ref-video-${i + 1}.mp4`,
            })
          );
        }
        referenceVideoUrls = rehostedVideos;
      }
      if (referenceAudioUrls.length) {
        const rehostedAudios: string[] = [];
        for (const [i, url] of referenceAudioUrls.entries()) {
          rehostedAudios.push(
            await rehostToKie({
              apiKey,
              fileUrl: url,
              uploadPath: `ainstareel/${userId}/ref-audio`,
              fileName: `ref-audio-${i + 1}.mp3`,
            })
          );
        }
        referenceAudioUrls = rehostedAudios;
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

    const aspect = body.aspect || model.defaultAspect;

    // Wan @Image + @Video: identity MUST stay on the still. Seal on the server
    // so a weak client prompt ("@Video1 reference video") cannot copy the reel woman.
    if (
      isWan3Family(model.id) &&
      referenceVideoUrls.length > 0 &&
      imageUrls.length > 0
    ) {
      prompt = sealWanReferencePromptForApi({
        prompt,
        modelName: body.modelName,
        aspect,
        imageCount: imageUrls.length,
        videoCount: referenceVideoUrls.length,
        audioCount: referenceAudioUrls.length,
      });
    } else if (
      isWan3Family(model.id) &&
      referenceVideoUrls.length > 0 &&
      imageUrls.length === 0
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Wan reference video needs your reference still as Image1. Without it the output copies the person from the reel.",
        },
        { status: 400 }
      );
    }

    const payload = buildKieInput({
      model,
      prompt,
      aspect,
      duration,
      resolution,
      imageUrls,
      lastFrameUrl,
      videoUrl,
      referenceVideoUrls,
      referenceAudioUrls,
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
