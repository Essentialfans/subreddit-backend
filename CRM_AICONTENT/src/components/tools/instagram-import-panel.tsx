"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Clapperboard,
  Download,
  Loader2,
  Link2,
} from "lucide-react";

export function InstagramImportPanel() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    shortcode: string;
    thumbnail: string | null;
    downloadUrl: string | null;
    hostedUrl: string | null;
    mediaType: string | null;
    note: string;
  } | null>(null);

  async function onImport() {
    setError("");
    setResult(null);
    if (!url.trim()) {
      setError("Paste an Instagram Reel or post URL.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tools/instagram-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), rehost: true }),
      });
      const text = await res.text();
      if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        throw new Error("Session expired — refresh and sign in again.");
      }
      const json = JSON.parse(text || "{}") as {
        ok?: boolean;
        error?: string;
        shortcode?: string;
        thumbnail?: string | null;
        downloadUrl?: string | null;
        hostedUrl?: string | null;
        mediaType?: string | null;
        note?: string;
      };
      if (!res.ok || !json.ok || !json.downloadUrl) {
        throw new Error(json.error || "Import failed");
      }
      setResult({
        shortcode: json.shortcode || "",
        thumbnail: json.thumbnail ?? null,
        downloadUrl: json.downloadUrl,
        hostedUrl: json.hostedUrl ?? null,
        mediaType: json.mediaType ?? null,
        note: json.note || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const promptHref =
    result?.hostedUrl || result?.downloadUrl
      ? `/video/prompt-from-clip?source=${encodeURIComponent(
          (result.hostedUrl || result.downloadUrl)!
        )}`
      : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Instagram Reel import
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste a public Instagram Reel or post link — same flow as fastdl-style
          downloaders. We fetch the MP4, store it in your workspace, then you can
          send it straight into Prompt from video.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-muted/20 p-4">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Instagram URL
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onImport();
              }}
              placeholder="https://www.instagram.com/reel/…"
              className="h-11 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary"
              disabled={busy}
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onImport()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy ? "Fetching…" : "Download"}
          </button>
          <button
            type="button"
            disabled={busy || !url}
            onClick={() => {
              setUrl("");
              setResult(null);
              setError("");
            }}
            className="inline-flex h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Clear
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-accent-red">{error}</p> : null}
      </div>

      {result ? (
        <div className="rounded-2xl border border-border p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex h-48 w-full max-w-[180px] items-center justify-center overflow-hidden rounded-xl bg-black">
              {result.mediaType === "video" && result.downloadUrl ? (
                <video
                  src={result.downloadUrl}
                  poster={result.thumbnail || undefined}
                  controls
                  className="h-full w-full object-contain"
                />
              ) : result.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.thumbnail}
                  alt="Preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Clapperboard className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ready
                </p>
                <p className="mt-1 text-sm">
                  {result.mediaType === "video" ? "Reel / video" : "Photo"} ·{" "}
                  {result.shortcode}
                </p>
                {result.note ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {result.note}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {result.downloadUrl ? (
                  <a
                    href={result.downloadUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download MP4
                  </a>
                ) : null}
                {promptHref ? (
                  <Link
                    href={promptHref}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    Send to Prompt from video
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How it works</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Copy the Reel URL from Instagram</li>
          <li>Paste here and hit Download</li>
          <li>Save the MP4, or send it into Prompt from video for Wan recreate</li>
        </ol>
        <p className="mt-3 text-xs">
          Public posts only. Private accounts won&apos;t resolve. Keep creator
          copyright in mind when reusing content.
        </p>
      </div>
    </div>
  );
}
