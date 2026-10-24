import { GenerateDock } from "@/components/generation/generate-dock";

export default async function SingleGenerationPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>;
}) {
  const params = await searchParams;
  return <GenerateDock initialModelId={params.model ?? null} />;
}
