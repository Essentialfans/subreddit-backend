import type { GenerationOutput, OutputKind } from "@/lib/outputs/store";

export class SaveOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveOutputError";
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
