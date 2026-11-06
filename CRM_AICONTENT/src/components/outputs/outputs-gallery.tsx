"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Clapperboard,
  Download,
  ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationOutput, OutputKind } from "@/lib/outputs/store";

async function downloadAsset(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function timeLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  if (hours >= 1) return `${hours}h left`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins}m left`;
}

export function OutputsGallery() {
  const [kind, setKind] = useState<OutputKind | "all">("all");
  const [outputs, setOutputs] = useState<GenerationOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = kind === "all" ? "" : `?kind=${kind}`;
      const res = await fetch(`/api/outputs${q}`, { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        outputs?: GenerationOutput[];
        error?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load");
      setOutputs(json.outputs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDelete(id: string) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/outputs/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Delete failed");
      setOutputs((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Outputs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generated images and videos stay here for 3 days, then auto-remove.
            Reopen any still to recreate or send to video.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "All"],
              ["image", "Images"],
              ["video", "Videos"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium border",
                kind === id
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-accent-red">{error}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading outputs…
        </div>
      ) : outputs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No outputs yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate an image or video — it will show up here automatically.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Link
              href="/image/generate"
              className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              Image Generation
            </Link>
            <Link
              href="/video/single"
              className="rounded-full border border-border px-4 py-2 text-xs font-medium"
            >
              Video Generation
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {outputs.map((o) => (
            <article
              key={o.id}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="relative aspect-[9/16] bg-muted">
                {o.kind === "video" ? (
                  <video
                    src={o.publicUrl}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    controls
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={o.publicUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white">
                  {o.kind === "video" ? (
                    <Video className="h-3 w-3" />
                  ) : (
                    <ImageIcon className="h-3 w-3" />
                  )}
                  {o.kind}
                </span>
                <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] text-white">
                  {timeLeft(o.expiresAt)}
                </span>
              </div>
              <div className="space-y-2 p-3">
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {o.prompt || o.modelLabel || "Generated output"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      void downloadAsset(
                        o.publicUrl,
                        `${o.kind}-${o.id.slice(0, 8)}.${
                          o.kind === "video" ? "mp4" : "png"
                        }`
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-zinc-900"
                  >
                    <Download className="h-3 w-3" />
                    Download
                  </button>
                  {o.kind === "image" ? (
                    <>
                      <Link
                        href={`/image/generate?mode=recreate&source=${encodeURIComponent(
                          o.publicUrl
                        )}${
                          o.creatorModelId
                            ? `&model=${o.creatorModelId}`
                            : ""
                        }`}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium"
                      >
                        Recreate
                      </Link>
                      <Link
                        href={`/video/single?image=${encodeURIComponent(
                          o.publicUrl
                        )}${
                          o.creatorModelId
                            ? `&model=${o.creatorModelId}`
                            : ""
                        }`}
                        className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
                      >
                        <Clapperboard className="h-3 w-3" />
                        Video
                      </Link>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === o.id}
                    onClick={() => void onDelete(o.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground"
                  >
                    {busyId === o.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
