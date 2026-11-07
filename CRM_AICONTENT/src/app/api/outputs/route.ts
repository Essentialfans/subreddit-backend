import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/kie/keys";
import {
  listUserOutputs,
  persistGenerationOutput,
  persistGenerationOutputBytes,
  type OutputKind,
} from "@/lib/outputs/store";

export const runtime = "nodejs";

function parseKind(value: unknown): OutputKind | null {
  return value === "image" || value === "video" ? value : null;
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);
    const kind = parseKind(searchParams.get("kind"));
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
    const contentType = request.headers.get("content-type") || "";

    // Preferred path: browser uploads the finished file (avoids CF→kie fetch).
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const kind = parseKind(form.get("kind"));
      const file = form.get("file");
      if (!kind) {
        return NextResponse.json(
          { ok: false, error: "kind must be image or video" },
          { status: 400 }
        );
      }
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "file is required" },
          { status: 400 }
        );
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const output = await persistGenerationOutputBytes({
        userId,
        kind,
        bytes,
        contentType: file.type || null,
        sourceUrl: String(form.get("sourceUrl") || "") || null,
        prompt: String(form.get("prompt") || "") || null,
        modelId: String(form.get("modelId") || "") || null,
        modelLabel: String(form.get("modelLabel") || "") || null,
        creatorModelId: String(form.get("creatorModelId") || "") || null,
        aspect: String(form.get("aspect") || "") || null,
        resolution: String(form.get("resolution") || "") || null,
      });
      return NextResponse.json({ ok: true, output });
    }

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

    const kind = parseKind(body.kind);
    if (!kind) {
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
      kind,
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
