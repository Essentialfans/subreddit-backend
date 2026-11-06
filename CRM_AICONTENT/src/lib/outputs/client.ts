import type { GenerationOutput, OutputKind } from "@/lib/outputs/store";

export class SaveOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveOutputError";
  }
}

async function blobFromUrl(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size < 64) return null;
    return blob;
  } catch {
    return null;
  }
}

/** Persist a finished kie result into Outputs (3-day gallery). */
export async function saveOutputToGallery(input: {
  kind: OutputKind;
  sourceUrl: string;
  prompt?: string;
  modelId?: string;
  modelLabel?: string;
  creatorModelId?: string | null;
  aspect?: string;
  resolution?: string;
}): Promise<GenerationOutput> {
  // Prefer uploading bytes from the browser — CF Workers often can't fetch kie CDN URLs.
  const blob = await blobFromUrl(input.sourceUrl);
  if (blob) {
    const form = new FormData();
    const ext =
      input.kind === "video"
        ? "mp4"
        : blob.type.includes("jpeg")
          ? "jpg"
          : "png";
    form.append(
      "file",
      new File([blob], `output.${ext}`, {
        type: blob.type || (input.kind === "video" ? "video/mp4" : "image/png"),
      })
    );
    form.append("kind", input.kind);
    form.append("sourceUrl", input.sourceUrl);
    if (input.prompt) form.append("prompt", input.prompt);
    if (input.modelId) form.append("modelId", input.modelId);
    if (input.modelLabel) form.append("modelLabel", input.modelLabel);
    if (input.creatorModelId) form.append("creatorModelId", input.creatorModelId);
    if (input.aspect) form.append("aspect", input.aspect);
    if (input.resolution) form.append("resolution", input.resolution);

    const res = await fetch("/api/outputs", { method: "POST", body: form });
    const json = (await res.json()) as {
      ok: boolean;
      output?: GenerationOutput;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.output) {
      throw new SaveOutputError(json.error || "Could not save to Outputs");
    }
    return json.output;
  }

  // Fallback: ask the server to pull the URL (or store the remote URL).
  const res = await fetch("/api/outputs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as {
    ok: boolean;
    output?: GenerationOutput;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.output) {
    throw new SaveOutputError(json.error || "Could not save to Outputs");
  }
  return json.output;
}
