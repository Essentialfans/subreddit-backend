export interface CreatorModelRef {
  id: string;
  publicUrl: string;
  storagePath: string;
  sortOrder: number;
}

export interface CreatorModel {
  id: string;
  name: string;
  slug: string;
  niche: string | null;
  status: "ready" | "in_progress" | "draft";
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
  refs: CreatorModelRef[];
}

export function slugifyModelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
