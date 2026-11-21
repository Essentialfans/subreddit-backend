"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

type ImportResult = {
  shortcode: string;
  thumbnail: string | null;
  downloadUrl: string | null;
  hostedUrl: string | null;
  mediaType: string | null;
  note: string;
};

function fastdlHrefFor(instagramUrl: string): string {
  const trimmed = instagramUrl.trim();
  if (!trimmed) return "https://fastdl.app/en";
  try {
    // FastDL stores the query as base64 in ?id=
    const id = btoa(trimmed);
    return `https://fastdl.app/en?id=${encodeURIComponent(id)}`;
  } catch {
    return `https://fastdl.app/en`;
  }
}

export function InstagramImportPanel() {
  const [url, setUrl] = useState("");
  const [directUrl, setDirectUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [fastdlWaiting, setFastdlWaiting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // When user returns from the FastDL tab, highlight the drop zone.
  useEffect(() => {
    if (!fastdlWaiting) return;
    const onFocus = () => setFastdlWaiting(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fastdlWaiting]);

  async function importUrl(target: string) {
    setError("");
    setResult(null);
    if (!target.trim()) {
      setError("Paste an Instagram Reel URL or a direct MP4 link.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tools/instagram-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.trim(), rehost: true }),
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
      setFastdlWaiting(false);
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
      setFastdlWaiting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadPct(null);
    }
  }

  function openFastdl() {
    if (!url.trim()) {
      setError("Paste the Instagram Reel URL first.");
      return;
    }
    setError("");
    setFastdlWaiting(true);
    window.open(fastdlHrefFor(url), "_blank", "noopener,noreferrer");
  }

  const promptHref =
    result?.hostedUrl || result?.downloadUrl
      ? `/video/prompt-from-clip?source=${encodeURIComponent(
          (result.hostedUrl || result.downloadUrl)!
        )}`
      : null;

  const blocked =
    Boolean(error) && /blocking|Could not download|blocked/i.test(error);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Instagram Reel import
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste a Reel link and we try automatic download. If Instagram blocks
          that, continue with FastDL from this page — we can&apos;t embed their
          site (they forbid iframes), but the handoff stays inside AiInstaReels.
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
                if (e.key === "Enter") void importUrl(url);
              }}
              placeholder="https://www.instagram.com/reel/…"
              className="h-11 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary"
              disabled={busy || uploading}
            />
          </div>
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => void importUrl(url)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy ? "Fetching…" : "Auto download"}
          </button>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-accent-red whitespace-pre-wrap break-words">
            {error}
          </p>
        ) : null}
      </div>

      <div
        className={`rounded-2xl border p-4 ${
          fastdlWaiting || blocked
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/10"
        }`}
      >
        <p className="text-sm font-semibold text-foreground">
          Use FastDL through AiInstaReels
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          FastDL blocks being framed inside other sites, so we open them in a
          tab, then bring the file back here. Same end result, under your
          workflow.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Paste the Reel URL above</li>
          <li>Click Continue with FastDL → download the MP4 there</li>
          <li>Come back and upload the MP4 (or paste the direct MP4 link)</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || uploading || !url.trim()}
            onClick={openFastdl}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Continue with FastDL
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold hover:bg-muted">
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading
              ? `Uploading${uploadPct != null ? ` ${uploadPct}%` : "…"}`
              : "Upload MP4 from FastDL"}
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

        <div className="mt-4 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Or paste FastDL direct MP4 link
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void importUrl(directUrl);
              }}
              placeholder="https://…mp4 (copy from FastDL download button)"
              className="h-10 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary"
              disabled={busy || uploading}
            />
            <button
              type="button"
              disabled={busy || uploading || !directUrl.trim()}
              onClick={() => void importUrl(directUrl)}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-xs font-semibold hover:bg-muted disabled:opacity-50"
            >
              Import link
            </button>
          </div>
        </div>

        {fastdlWaiting ? (
          <p className="mt-3 text-xs text-primary">
            FastDL tab opened — when the MP4 is ready, upload it here or paste
            the direct link.
          </p>
        ) : null}
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
    </div>
  );
}
