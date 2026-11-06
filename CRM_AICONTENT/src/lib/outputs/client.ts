import type { GenerationOutput, OutputKind } from "@/lib/outputs/store";

/** Persist a finished kie result into Outputs (3-day gallery). Best-effort. */
export async function saveOutputToGallery(input: {
  kind: OutputKind;
  sourceUrl: string;
  prompt?: string;
  modelId?: string;
  modelLabel?: string;
  creatorModelId?: string | null;
  aspect?: string;
  resolution?: string;
}): Promise<GenerationOutput | null> {
  try {
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
    if (!res.ok || !json.ok || !json.output) return null;
    return json.output;
  } catch {
    return null;
  }
}
