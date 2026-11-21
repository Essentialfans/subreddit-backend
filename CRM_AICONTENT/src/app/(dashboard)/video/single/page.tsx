import { VideoDock } from "@/components/generation/video-dock";

export default async function VideoGenerationPage({
  searchParams,
}: {
  searchParams: Promise<{
    model?: string;
    image?: string;
    prompt?: string;
    wan?: string;
    from?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <VideoDock
      initialModelId={params.model ?? null}
      initialImageUrl={params.image ?? null}
      initialPrompt={params.prompt ?? null}
      initialVideoModelId={params.wan ?? null}
      fromPromptClip={params.from === "prompt-clip"}
    />
  );
}
