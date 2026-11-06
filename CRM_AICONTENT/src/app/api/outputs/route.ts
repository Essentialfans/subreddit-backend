import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/kie/keys";
import {
  listUserOutputs,
  persistGenerationOutput,
  type OutputKind,
} from "@/lib/outputs/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);
    const kindParam = searchParams.get("kind");
    const kind =
      kindParam === "image" || kindParam === "video"
        ? (kindParam as OutputKind)
        : null;
    const outputs = await listUserOutputs(userId, kind);
    return NextResponse.json({ ok: true, outputs, ttlDays: 3 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      kind?: OutputKind;
      sourceUrl?: string;
      prompt?: string;
      modelId?: string;
      modelLabel?: string;
      creatorModelId?: string;
      aspect?: string;
      resolution?: string;
    };

    if (body.kind !== "image" && body.kind !== "video") {
      return NextResponse.json(
        { ok: false, error: "kind must be image or video" },
        { status: 400 }
      );
    }
    if (!body.sourceUrl?.trim()) {
      return NextResponse.json(
        { ok: false, error: "sourceUrl is required" },
        { status: 400 }
      );
    }

    const output = await persistGenerationOutput({
      userId,
      kind: body.kind,
      sourceUrl: body.sourceUrl.trim(),
      prompt: body.prompt,
      modelId: body.modelId,
      modelLabel: body.modelLabel,
      creatorModelId: body.creatorModelId,
      aspect: body.aspect,
      resolution: body.resolution,
    });

    return NextResponse.json({ ok: true, output });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
