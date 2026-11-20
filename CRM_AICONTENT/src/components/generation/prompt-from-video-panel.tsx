"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clapperboard,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CreatorModel } from "@/lib/models/types";
import { PROMPT_LLM_OPTIONS, type PromptLlmId } from "@/lib/kie/prompt-llms";
import { uploadGenerationFile } from "@/lib/generation/upload-client";
import { extractKeyframesFromVideoFile } from "@/lib/generation/extract-keyframes";
import { UploadProgressBar } from "@/components/generation/upload-progress";
import "./generate-dock.css";

const WAN_TARGETS = [
  { id: "wan-3-0", label: "Wan 3.0" },
  { id: "wan-3-prime", label: "Wan 3.0 Prime" },
];

export function PromptFromVideoPanel({
  initialModelId,
}: {
  initialModelId?: string | null;
}) {
  const [creatorModels, setCreatorModels] = useState<CreatorModel[]>([]);
  const [creatorId, setCreatorId] = useState<string | null>(
    initialModelId ?? null
  );
  const creator = creatorModels.find((m) => m.id === creatorId) ?? null;

  const [llm, setLlm] = useState<PromptLlmId>("grok-4-7");
  const [videoModelId, setVideoModelId] = useState("wan-3-0");
  const [lookAlike, setLookAlike] = useState(false);
  const [aspect, setAspect] = useState("9:16");

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [keyframeUrls, setKeyframeUrls] = useState<string[]>([]);
  const [keyframeTimesSec, setKeyframeTimesSec] = useState<number[]>([]);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [preparing, setPreparing] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [transcript, setTranscript] = useState("");
  const [note, setNote] = useState("");
  const [keyReady, setKeyReady] = useState<boolean | null>(null);

  const [openMenu, setOpenMenu] = useState<
    null | "model" | "llm" | "wan" | "aspect"
  >(null);

  const loadModels = useCallback(async () => {
    const res = await fetch("/api/models", { cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; models?: CreatorModel[] };
    if (json.ok && json.models) {
      setCreatorModels(json.models);
      setCreatorId((prev) => {
        if (prev && json.models!.some((m) => m.id === prev)) return prev;
        if (initialModelId && json.models!.some((m) => m.id === initialModelId))
          return initialModelId;
        return json.models![0]?.id ?? null;
      });
    }
  }, [initialModelId]);

  useEffect(() => {
    void loadModels();
    void fetch("/api/settings/kie", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { configured?: boolean }) => setKeyReady(Boolean(j.configured)))
      .catch(() => setKeyReady(false));
  }, [loadModels]);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const llmOption = useMemo(
    () => PROMPT_LLM_OPTIONS.find((o) => o.id === llm) ?? PROMPT_LLM_OPTIONS[0],
    [llm]
  );

  async function onPickFile(file: File) {
    setError("");
    setPrompt("");
    setTranscript("");
    setNote("");
    setKeyframeUrls([]);
    setKeyframeTimesSec([]);
    setLocalFile(file);
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setPreparing(true);
    setUploadPct(0);
    try {
      const [{ frames, durationSec: dur }, uploadedVideo] = await Promise.all([
        extractKeyframesFromVideoFile(file, 7),
        uploadGenerationFile(file, setUploadPct),
      ]);
      setDurationSec(dur);
      setVideoUrl(uploadedVideo);
      setKeyframeTimesSec(frames.map((f) => f.timeSec));

      const uploadedFrames: string[] = [];
      for (let i = 0; i < frames.length; i++) {
        const url = await uploadGenerationFile(
          new File([frames[i].blob], `kf-${i + 1}.jpg`, { type: "image/jpeg" })
        );
        uploadedFrames.push(url);
      }
      setKeyframeUrls(uploadedFrames);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare clip");
      setVideoUrl("");
      setKeyframeUrls([]);
      setKeyframeTimesSec([]);
    } finally {
      setUploadPct(null);
      setPreparing(false);
    }
  }

  async function onGeneratePrompt() {
    setError("");
    if (!keyReady) {
      setError("Add your kie.ai API key in Settings first.");
      return;
    }
    if (!creator) {
      setError("Select a My Model first.");
      return;
    }
    if (!videoUrl || keyframeUrls.length < 1) {
      setError("Upload a source video and wait for keyframes.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/generation/prompt-from-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceVideoUrl: videoUrl,
          keyframeUrls,
          keyframeTimesSec,
          creatorId: creator.id,
          modelName: creator.name,
          llm,
          videoModelId,
          lookAlike,
          durationSec,
          aspect,
        }),
      });
      const text = await res.text();
      if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        throw new Error("Session expired — refresh and sign in again.");
      }
      const json = JSON.parse(text || "{}") as {
        ok?: boolean;
        prompt?: string;
        transcript?: string;
        note?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.prompt) {
        throw new Error(json.error || "Prompt generation failed");
      }
      setPrompt(json.prompt);
      setTranscript(json.transcript || "");
      setNote(json.note || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prompt generation failed");
    } finally {
      setBusy(false);
    }
  }

  function sendToStudio() {
    if (!prompt.trim() || !creator) return;
    try {
      sessionStorage.setItem(
        "ainstareel:prompt-from-video",
        JSON.stringify({
          prompt: prompt.trim(),
          modelId: creator.id,
          wan: videoModelId,
          aspect,
        })
      );
    } catch {
      // private mode / quota — VideoDock still accepts ?prompt= fallback
    }
    const qs = new URLSearchParams({
      model: creator.id,
      wan: videoModelId,
    });
    // Short prompts can ride the query; long ones use sessionStorage only.
    if (prompt.trim().length < 1500) {
      qs.set("prompt", prompt.trim());
    } else {
      qs.set("from", "prompt-clip");
    }
    window.location.href = `/video/single?${qs.toString()}`;
  }

  return (
    <div className="gen-dock-page">
      <div className="flex flex-1 flex-col gap-0 lg:flex-row">
        <div className="flex min-h-[280px] flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Source clip
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Drop the reel to recreate. We transcribe dialogue and build a Wan
              prompt that uses <strong>My Model</strong> as who appears — not
              the source face.
            </p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
            {previewUrl ? (
              <video
                src={previewUrl}
                controls
                className="max-h-[420px] w-full max-w-md rounded-xl bg-black object-contain"
              />
            ) : (
              <div className="flex h-48 w-full max-w-md flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
                <Clapperboard className="mb-2 h-8 w-8" />
                <p className="text-sm">No clip yet</p>
              </div>
            )}
            <label className="gen-chip cursor-pointer">
              {preparing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {localFile ? "Replace video" : "Upload video"}
                </>
              )}
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/*"
                className="hidden"
                disabled={preparing || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {uploadPct !== null ? (
              <UploadProgressBar pct={uploadPct} label="Uploading clip…" />
            ) : null}
            {durationSec ? (
              <p className="text-xs text-muted-foreground">
                Duration ~{durationSec.toFixed(1)}s · {keyframeUrls.length}{" "}
                keyframes
              </p>
            ) : null}
            {keyframeUrls.length ? (
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {keyframeUrls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={url}
                    src={url}
                    alt={`Keyframe ${i + 1}`}
                    className="h-16 w-12 rounded-md object-cover"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 p-4 lg:w-[420px]">
          <div className="relative space-y-1">
            <p className="gen-label">My Model</p>
            <button
              type="button"
              className="gen-chip w-full justify-between"
              data-active={openMenu === "model"}
              onClick={() =>
                setOpenMenu((m) => (m === "model" ? null : "model"))
              }
            >
              <span>{creator?.name ?? "Select model"}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openMenu === "model" ? (
              <div className="gen-menu">
                {creatorModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
                      m.id === creatorId
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-muted"
                    )}
                    onClick={() => {
                      setCreatorId(m.id);
                      setOpenMenu(null);
                    }}
                  >
                    {m.name}
                    {m.id === creatorId ? <Check className="h-3.5 w-3.5" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative space-y-1">
            <p className="gen-label">Prompt LLM</p>
            <button
              type="button"
              className="gen-chip w-full justify-between"
              data-active={openMenu === "llm"}
              onClick={() => setOpenMenu((m) => (m === "llm" ? null : "llm"))}
            >
              <span>{llmOption.label}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openMenu === "llm" ? (
              <div className="gen-menu">
                {PROMPT_LLM_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={cn(
                      "flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm",
                      o.id === llm
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-muted"
                    )}
                    onClick={() => {
                      setLlm(o.id);
                      setOpenMenu(null);
                    }}
                  >
                    <span className="font-medium">{o.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {o.blurb}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative space-y-1">
            <p className="gen-label">Target video model</p>
            <button
              type="button"
              className="gen-chip w-full justify-between"
              data-active={openMenu === "wan"}
              onClick={() => setOpenMenu((m) => (m === "wan" ? null : "wan"))}
            >
              <span>
                {WAN_TARGETS.find((w) => w.id === videoModelId)?.label}
              </span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openMenu === "wan" ? (
              <div className="gen-menu">
                {WAN_TARGETS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
                      w.id === videoModelId
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-muted"
                    )}
                    onClick={() => {
                      setVideoModelId(w.id);
                      setOpenMenu(null);
                    }}
                  >
                    {w.label}
                    {w.id === videoModelId ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Look-alike mode</p>
              <p className="text-[11px] text-muted-foreground">
                Off = never copy the source person&apos;s face/hair/body
              </p>
            </div>
            <button
              type="button"
              className="gen-toggle"
              data-on={lookAlike}
              onClick={() => setLookAlike((v) => !v)}
              aria-label="Toggle look-alike mode"
            />
          </div>

          <div className="relative space-y-1">
            <p className="gen-label">Aspect hint</p>
            <button
              type="button"
              className="gen-chip"
              data-active={openMenu === "aspect"}
              onClick={() =>
                setOpenMenu((m) => (m === "aspect" ? null : "aspect"))
              }
            >
              {aspect}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openMenu === "aspect" ? (
              <div className="gen-menu">
                {["9:16", "16:9", "1:1", "4:3", "3:4"].map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={cn(
                      "flex w-full rounded-lg px-3 py-2 text-left text-sm",
                      a === aspect
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-muted"
                    )}
                    onClick={() => {
                      setAspect(a);
                      setOpenMenu(null);
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            disabled={busy || preparing}
            onClick={() => void onGeneratePrompt()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate prompt
          </button>

          {error ? <p className="text-sm text-accent-red">{error}</p> : null}
          {keyReady === false ? (
            <p className="text-xs text-muted-foreground">
              kie.ai not connected —{" "}
              <Link href="/system/settings" className="text-primary underline">
                add API key
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      <div className="gen-dock-panel gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="gen-label">Paste-ready Wan prompt</p>
            {note ? (
              <p className="text-[11px] text-muted-foreground">{note}</p>
            ) : null}
          </div>
          {prompt.trim() && creator ? (
            <button
              type="button"
              onClick={sendToStudio}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              Send to Video studio
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <textarea
          className="gen-prompt min-h-[180px]"
          placeholder="Generated prompt appears here — edit freely before sending to Wan…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        {transcript ? (
          <details className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              ASR transcript
            </summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans">{transcript}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
