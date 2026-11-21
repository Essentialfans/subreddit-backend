import { PromptFromVideoPanel } from "@/components/generation/prompt-from-video-panel";

export default async function PromptFromClipPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; source?: string }>;
}) {
  const params = await searchParams;
  return (
    <PromptFromVideoPanel
      initialModelId={params.model ?? null}
      initialSourceUrl={params.source ?? null}
    />
  );
}
