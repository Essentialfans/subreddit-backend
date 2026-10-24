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
      imageUrl?: string | null;
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
    if (prompt.length < 3) {
      return NextResponse.json(
        { ok: false, error: "Prompt is too short" },
        { status: 400 }
      );
    }

    if (model.requiresImage && !body.imageUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: `${model.label} needs a reference image — generate one first or paste a URL.`,
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
    const payload = buildKieInput({
      model,
      prompt,
      aspect: body.aspect || model.defaultAspect,
      duration: body.duration ?? model.defaultDuration,
      imageUrl: body.imageUrl,
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
    const message = error instanceof Error ? error.message : "Generation failed";
    const status =
      message === "Unauthorized"
        ? 401
        : /Add your kie\.ai/i.test(message)
          ? 400
          : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
