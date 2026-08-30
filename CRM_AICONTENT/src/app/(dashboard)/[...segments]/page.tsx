import { PlaceholderPage } from "@/components/placeholder-page";
import { getPageTitle } from "@/lib/navigation";

export default async function DynamicPlaceholderPage({
  params,
}: {
  params: Promise<{ segments: string[] }>;
}) {
  const { segments } = await params;
  const pathname = "/" + segments.join("/");
  const title = getPageTitle(pathname);

  return <PlaceholderPage title={title} />;
}
