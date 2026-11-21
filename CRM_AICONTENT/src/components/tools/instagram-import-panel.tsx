"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Clapperboard,
  Download,
  ExternalLink,
  Loader2,
  Link2,
  Upload,
} from "lucide-react";
import { uploadGenerationFile } from "@/lib/generation/upload-client";

export function InstagramImportPanel() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    shortcode: string;
    thumbnail: string | null;
    downloadUrl: string | null;
    hostedUrl: string | null;
    mediaType: string | null;
    note: string;
  } | null>(null);

  const fastdlHref = url.trim()
    ? `https://fastdl.app/en#url=${encodeURIComponent(url.trim())}`
    : "https://fastdl.app/en";

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

  async function onUploadMp4(file: File) {
    setError("");
    setResult(null);
    setUploading(true);
    setUploadPct(0);
    try {
      const hosted = await uploadGenerationFile(file, setUploadPct);
      setResult({
        shortcode: file.name.replace(/\.[^.]+$/, "") || "upload",
        thumbnail: null,
        downloadUrl: hosted,
        hostedUrl: hosted,
        mediaType: "video",
        note: "Uploaded MP4 ready — send it into Prompt from video.",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadPct(null);
    }
  }

  const promptHref =
    result?.hostedUrl || result?.downloadUrl
      ? `/video/prompt-from-clip?source=${encodeURIComponent(
          (result.hostedUrl || result.downloadUrl)!
        )}`
      : null;

  const showWorkaround = Boolean(error);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Instagram Reel import
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste a public Instagram Reel or post link. We try several downloaders,
          then store the MP4 in your workspace so you can send it into Prompt from
          video.
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
              disabled={busy || uploading}
            />
          </div>
          <button
            type="button"
            disabled={busy || uploading}
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
            disabled={busy || uploading || !url}
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
        {error ? (
          <p className="mt-3 text-sm text-accent-red whitespace-pre-wrap break-words">
            {error}
          </p>
        ) : null}
      </div>

      {showWorkaround ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium text-foreground">
            Instagram is blocking automatic downloaders
          </p>
          <p className="mt-1 text-muted-foreground">
            No extra AiInstaReels setting is missing for the basic flow — IG is
            rejecting anonymous server fetches. Use one of these workarounds:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={fastdlHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold hover:bg-muted"
            >
              Open FastDL
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading
                ? `Uploading${uploadPct != null ? ` ${uploadPct}%` : "…"}`
                : "Upload MP4 here"}
              <input
                type="file"
                accept="video/mp4,video/*,.mp4"
                className="hidden"
                disabled={uploading || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUploadMp4(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Open FastDL (or any Reel downloader) with your link</li>
            <li>Save the MP4 to your device</li>
            <li>Upload it here → Send to Prompt from video</li>
          </ol>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Or upload an MP4 directly</p>
          <p className="mt-1 text-xs">
            If automatic Download fails, grab the file from FastDL and drop it
            here — same end result.
          </p>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold hover:bg-muted">
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading
              ? `Uploading${uploadPct != null ? ` ${uploadPct}%` : "…"}`
              : "Upload MP4"}
            <input
              type="file"
              accept="video/mp4,video/*,.mp4"
              className="hidden"
              disabled={uploading || busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUploadMp4(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}

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
          <li>Paste here and hit Download (we try several resolvers)</li>
          <li>
            If Instagram blocks them: FastDL → save MP4 → Upload here → Prompt
            from video
          </li>
        </ol>
        <p className="mt-3 text-xs">
          Public posts only. Instagram often requires login for scrapers now —
          that is on their side, not a missing AiInstaReels toggle. Keep creator
          copyright in mind when reusing content.
        </p>
      </div>
    </div>
  );
}
