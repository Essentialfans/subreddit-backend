import { VideoDock } from "@/components/generation/video-dock";

export default async function VideoGenerationPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string; image?: string }>;
}) {
  const params = await searchParams;
  return (
    <VideoDock
      initialModelId={params.model ?? null}
      initialImageUrl={params.image ?? null}
    />
  );
}
