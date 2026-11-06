import { GenerateDock } from "@/components/generation/generate-dock";
import type { GenerateMode } from "@/lib/generation/presets";

export default async function ImageGenerationPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; mode?: string; source?: string }>;
}) {
  const params = await searchParams;
  const mode =
    params.mode === "presets" ||
    params.mode === "recreate" ||
    params.mode === "free"
      ? (params.mode as GenerateMode)
      : null;
  return (
    <GenerateDock
      initialModelId={params.model ?? null}
      initialMode={mode}
      initialSourceUrl={params.source ?? null}
    />
  );
}
