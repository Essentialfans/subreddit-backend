"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ImageIcon,
  Loader2,
  Plus,
  Sparkles,
  Square,
  Smartphone,
  Monitor,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VIDEO_CATEGORY_LABELS,
  videoModelsByCategory,
  type VideoCategory,
} from "@/lib/kie/models";
import type { CreatorModel } from "@/lib/models/types";
import { RATIO_OPTIONS } from "@/lib/generation/presets";
import "./generate-dock.css";

type Slot =
  | { state: "empty" }
  | { state: "generating" }
  | { state: "done"; url: string }
  | { state: "error"; message: string };

type OpenMenu = null | "model" | "gen" | "ratio" | "duration" | "resolution";

function RatioIcon({ id }: { id: string }) {
  if (id === "1:1") return <Square className="h-3.5 w-3.5" />;
  if (id === "9:16" || id === "4:5" || id === "3:4")
    return <Smartphone className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export function VideoDock({
  initialModelId,
  initialImageUrl,
}: {
  initialModelId?: string | null;
  initialImageUrl?: string | null;
}) {
  const [creatorModels, setCreatorModels] = useState<CreatorModel[]>([]);
  const [creatorId, setCreatorId] = useState<string | null>(
    initialModelId ?? null
  );
  const creator = creatorModels.find((m) => m.id === creatorId) ?? null;

  const [category, setCategory] = useState<VideoCategory>("prompting");
  const categoryModels = useMemo(
    () => videoModelsByCategory(category),
    [category]
  );

  const [videoModelId, setVideoModelId] = useState(
    () =>
      videoModelsByCategory("prompting").find((m) => m.id === "kling-4-0")
        ?.id ??
      videoModelsByCategory("prompting")[0]?.id ??
      ""
  );
  const videoModel =
    categoryModels.find((m) => m.id === videoModelId) ?? categoryModels[0];

  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState("9:16");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("720p");
  const [referenceUrl, setReferenceUrl] = useState(initialImageUrl ?? "");
  const [audioUrl, setAudioUrl] = useState("");
  const [enhance, setEnhance] = useState(true);
  const [slots, setSlots] = useState<Slot[]>([
    { state: "empty" },
    { state: "empty" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    if (initialImageUrl) setReferenceUrl(initialImageUrl);
  }, [initialImageUrl]);

  // Keep selected model inside the active category
  useEffect(() => {
    if (!categoryModels.some((m) => m.id === videoModelId)) {
      setVideoModelId(categoryModels[0]?.id ?? "");
    }
  }, [category, categoryModels, videoModelId]);

  // Sync duration / ratio / resolution to what the chosen model allows
  useEffect(() => {
    if (!videoModel) return;
    if (videoModel.defaultAspect) setRatio(videoModel.defaultAspect);

    const durations = videoModel.durations ?? [];
    if (durations.length > 0) {
      setDuration((prev) =>
        durations.includes(prev)
          ? prev
          : (videoModel.defaultDuration ?? durations[0])
      );
    }

    const resolutions = videoModel.resolutions ?? [];
    if (resolutions.length > 0) {
      setResolution((prev) =>
        resolutions.includes(prev)
          ? prev
          : (videoModel.defaultResolution ?? resolutions[0])
      );
    }
  }, [videoModel?.id]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const durationOptions = useMemo(
    () => videoModel?.durations ?? [],
    [videoModel]
  );
  const resolutionOptions = useMemo(
    () => videoModel?.resolutions ?? [],
    [videoModel]
  );
  const showDuration = durationOptions.length > 0;
  const showResolution = resolutionOptions.length > 0;

  async function uploadPublicFile(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/generation/upload", {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as {
      ok: boolean;
      url?: string;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.url) {
      throw new Error(json.error || "Upload failed");
    }
    return json.url;
  }

  async function onGenerate() {
    setError("");
    if (!keyReady) {
      setError("Add your kie.ai API key in Settings first.");
      return;
    }
    if (!videoModel) {
      setError("Pick a video model.");
      return;
    }
    if (videoModel.requiresImage && !referenceUrl.trim()) {
      setError(
        `${videoModel.label} needs a still — generate one in Image Generation and Send to video, or upload here.`
      );
      return;
    }
    if (videoModel.requiresAudio && !audioUrl.trim()) {
      setError(`${videoModel.label} needs an audio URL.`);
      return;
    }
    if (prompt.trim().length < 3) {
      setError("Add a short motion prompt.");
      return;
    }

    setBusy(true);
    setSlots([{ state: "generating" }, { state: "empty" }]);

    try {
      let finalPrompt = prompt.trim();
      if (enhance) {
        const enhanceRes = await fetch("/api/generation/enhance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "free",
            userText: prompt,
            modelName: creator?.name,
            enhanceWithAi: true,
            refLabels: referenceUrl ? ["source still"] : [],
          }),
        });
        const enhanceJson = (await enhanceRes.json()) as {
          ok: boolean;
          prompt?: string;
          error?: string;
        };
        if (enhanceRes.ok && enhanceJson.ok && enhanceJson.prompt) {
          finalPrompt = `${enhanceJson.prompt} Animate as a short vertical video with natural motion.`;
        }
      } else if (creator?.name) {
        finalPrompt = `${finalPrompt} Featuring ${creator.name}, matching reference identity.`;
      }

      const imageUrls = [
        ...(referenceUrl ? [referenceUrl] : []),
        ...(creator?.refs.map((r) => r.publicUrl) ?? []),
      ];

      const createRes = await fetch("/api/generation/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: videoModel.id,
          prompt: finalPrompt,
          aspect: ratio,
          duration: showDuration ? duration : undefined,
          resolution: showResolution ? resolution : undefined,
          imageUrls,
          audioUrl: audioUrl.trim() || null,
        }),
      });
      const created = (await createRes.json()) as {
        ok: boolean;
        taskId?: string;
        error?: string;
      };
      if (!createRes.ok || !created.ok || !created.taskId) {
        throw new Error(created.error || "Could not start video job");
      }

      const url = await pollVideoTask(created.taskId);
      setSlots([{ state: "done", url }, { state: "empty" }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Video failed";
      setError(message);
      setSlots([{ state: "error", message }, { state: "empty" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gen-dock-page">
      <div
        className="gen-dock-stage"
        style={{
          gridTemplateColumns:
            "minmax(0,1.4fr) minmax(0,1fr) minmax(200px,0.7fr)",
        }}
      >
        {slots.map((slot, i) => (
          <div key={i} className="gen-dock-cell">
            {slot.state === "generating" ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm">Generating video…</span>
              </div>
            ) : slot.state === "done" ? (
              <video
                src={slot.url}
                controls
                className="h-full w-full bg-black object-contain"
              />
            ) : slot.state === "error" ? (
              <p className="px-6 text-center text-sm text-accent-red">
                {slot.message}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {i === 0 ? "Video stage" : "Ready"}
              </p>
            )}
          </div>
        ))}
        <div className="gen-dock-cell flex-col gap-3 px-4 text-center">
          <p className="text-xs font-medium text-muted-foreground">
            Source still
          </p>
          {referenceUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={referenceUrl}
                alt="Source"
                className="mx-auto h-36 w-24 rounded-xl object-cover"
              />
              <button
                type="button"
                onClick={() => setReferenceUrl("")}
                className="absolute -right-2 -top-2 rounded-full border border-border bg-card p-1"
                aria-label="Clear source"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex h-36 w-24 flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
              <ImageIcon className="mb-1 h-5 w-5" />
              <span className="text-[10px]">None</span>
            </div>
          )}
          <Link
            href="/image/generate"
            className="text-xs font-medium text-primary hover:underline"
          >
            ← Image Generation
          </Link>
          {creator ? (
            <p className="text-[11px] text-muted-foreground">
              {creator.name} · {creator.refs.length}/3 refs
            </p>
          ) : null}
        </div>
      </div>

      <div className="gen-dock-panel" ref={menuRef}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="gen-mode-tabs" role="tablist" aria-label="Video type">
            {(
              Object.keys(VIDEO_CATEGORY_LABELS) as VideoCategory[]
            ).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={category === id}
                data-active={category === id}
                onClick={() => {
                  setCategory(id);
                  setOpenMenu(null);
                }}
              >
                {VIDEO_CATEGORY_LABELS[id]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Models and limits match what each API supports
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="relative space-y-1">
            <p className="gen-label">Identity</p>
            <button
              type="button"
              className="gen-chip"
              data-active={openMenu === "model"}
              onClick={() =>
                setOpenMenu((m) => (m === "model" ? null : "model"))
              }
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {(creator?.name ?? "M").slice(0, 1).toUpperCase()}
              </span>
              {creator?.name ?? "Optional model"}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {openMenu === "model" ? (
              <div className="gen-menu left-0 top-[calc(100%+6px)]">
                <button
                  type="button"
                  data-active={!creatorId}
                  onClick={() => {
                    setCreatorId(null);
                    setOpenMenu(null);
                  }}
                >
                  No identity
                </button>
                {creatorModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    data-active={m.id === creatorId}
                    onClick={() => {
                      setCreatorId(m.id);
                      setOpenMenu(null);
                    }}
                  >
                    {m.id === creatorId ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <span className="w-3.5" />
                    )}
                    {m.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative min-w-[200px] flex-1 space-y-1">
            <p className="gen-label">Video model</p>
            <button
              type="button"
              className="gen-chip w-full justify-between sm:w-auto"
              onClick={() => setOpenMenu((m) => (m === "gen" ? null : "gen"))}
            >
              <span className="flex items-center gap-2">
                {videoModel?.label ?? "Pick model"}
                {videoModel?.badge === "new" ? (
                  <span className="rounded bg-accent-red px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    New
                  </span>
                ) : null}
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {openMenu === "gen" ? (
              <div className="gen-menu left-0 bottom-auto top-[calc(100%+6px)] max-h-72">
                {categoryModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    data-active={m.id === videoModelId}
                    onClick={() => {
                      setVideoModelId(m.id);
                      setOpenMenu(null);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {m.label}
                        {m.badge === "new" ? (
                          <span className="rounded bg-accent-red/90 px-1 text-[9px] font-bold uppercase text-white">
                            New
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {m.blurb}
                        {m.durations && m.durations.length > 0
                          ? ` · ${m.durations[0]}–${m.durations[m.durations.length - 1]}s`
                          : ""}
                        {m.resolutions && m.resolutions.length > 0
                          ? ` · ${m.resolutions.join(" / ")}`
                          : ""}
                      </span>
                    </span>
                    {m.id === videoModelId ? (
                      <Check className="h-3.5 w-3.5 shrink-0" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-1">
            <p className="gen-label">Source still</p>
            <div className="flex items-center gap-2">
              <label className="gen-chip cursor-pointer">
                <Plus className="h-4 w-4" />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void uploadPublicFile(f)
                      .then(setReferenceUrl)
                      .catch((err) =>
                        setError(
                          err instanceof Error ? err.message : "Upload failed"
                        )
                      );
                    e.target.value = "";
                  }}
                />
              </label>
              {!referenceUrl ? (
                <span className="text-xs text-muted-foreground">
                  or Send to video from Image Generation
                </span>
              ) : (
                <span className="text-xs text-accent-green">Attached</span>
              )}
            </div>
          </div>
        </div>

        <div className="relative">
          <input
            className="gen-prompt pr-[170px]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the motion… slow push-in, hair in wind, cinematic lights…"
          />
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2 text-xs text-muted-foreground">
            Enhance with AI
            <button
              type="button"
              className="gen-toggle"
              data-on={enhance}
              onClick={() => setEnhance((v) => !v)}
              aria-label="Enhance with AI"
            />
          </div>
        </div>

        {videoModel?.requiresAudio ? (
          <input
            className="gen-prompt"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="Audio URL required for this model (https://…/voice.mp3)"
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative space-y-1">
            <p className="gen-label">Ratio</p>
            <button
              type="button"
              className="gen-chip"
              onClick={() =>
                setOpenMenu((m) => (m === "ratio" ? null : "ratio"))
              }
            >
              <RatioIcon id={ratio} />
              {RATIO_OPTIONS.find((r) => r.id === ratio)?.label ?? ratio}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {openMenu === "ratio" ? (
              <div className="gen-menu left-0 bottom-[calc(100%+6px)]">
                {(videoModel?.aspectOptions ?? ["9:16", "16:9", "1:1"]).map(
                  (id) => {
                    const opt = RATIO_OPTIONS.find((r) => r.id === id);
                    return (
                      <button
                        key={id}
                        type="button"
                        data-active={id === ratio}
                        onClick={() => {
                          setRatio(id);
                          setOpenMenu(null);
                        }}
                      >
                        <RatioIcon id={id} />
                        {opt?.label ?? id}
                        {id === ratio ? (
                          <Check className="ml-auto h-3.5 w-3.5" />
                        ) : null}
                      </button>
                    );
                  }
                )}
              </div>
            ) : null}
          </div>

          {showDuration ? (
            <div className="relative space-y-1">
              <p className="gen-label">Duration</p>
              {durationOptions.length <= 6 ? (
                <div className="flex rounded-full border border-border bg-muted p-0.5">
                  {durationOptions.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration(d)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium",
                        duration === d
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="gen-chip"
                    data-active={openMenu === "duration"}
                    onClick={() =>
                      setOpenMenu((m) =>
                        m === "duration" ? null : "duration"
                      )
                    }
                  >
                    {duration}s
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </button>
                  {openMenu === "duration" ? (
                    <div className="gen-menu left-0 bottom-[calc(100%+6px)] max-h-56">
                      {durationOptions.map((d) => (
                        <button
                          key={d}
                          type="button"
                          data-active={d === duration}
                          onClick={() => {
                            setDuration(d);
                            setOpenMenu(null);
                          }}
                        >
                          {d} seconds
                          {d === duration ? (
                            <Check className="ml-auto h-3.5 w-3.5" />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : videoModel?.durationNote ? (
            <div className="space-y-1">
              <p className="gen-label">Duration</p>
              <p className="max-w-[220px] text-xs text-muted-foreground">
                {videoModel.durationNote}
              </p>
            </div>
          ) : null}

          {showResolution ? (
            <div className="relative space-y-1">
              <p className="gen-label">Resolution</p>
              <div className="flex rounded-full border border-border bg-muted p-0.5">
                {resolutionOptions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setResolution(r)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium",
                      resolution === r
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showDuration && videoModel?.durationNote ? (
            <p className="w-full text-[11px] text-muted-foreground">
              {videoModel.durationNote}
            </p>
          ) : null}

          <div className="ml-auto">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onGenerate()}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate video
            </button>
          </div>
        </div>

        {error ? <p className="text-sm text-accent-red">{error}</p> : null}
        {keyReady === false ? (
          <p className="text-xs text-muted-foreground">
            kie.ai not connected —{" "}
            <Link href="/system/settings" className="text-primary underline">
              add API key
            </Link>
          </p>
        ) : null}
        {initialImageUrl ? (
          <p className="text-xs text-accent-green">
            Still received from Image Generation — pick a video model and
            generate.
          </p>
        ) : null}
      </div>
    </div>
  );
}

async function pollVideoTask(taskId: string): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < 10 * 60 * 1000) {
    const res = await fetch(
      `/api/generation/status?taskId=${encodeURIComponent(taskId)}`,
      { cache: "no-store" }
    );
    const json = (await res.json()) as {
      ok: boolean;
      status?: string;
      videoUrls?: string[];
      resultUrls?: string[];
      failMsg?: string;
      error?: string;
    };
    if (!res.ok || !json.ok) throw new Error(json.error || "Status failed");
    if (json.status === "failed") {
      throw new Error(json.failMsg || "Video generation failed");
    }
    if (json.status === "success") {
      const url =
        json.videoUrls?.[0] ||
        json.resultUrls?.find((u) => /\.(mp4|webm|mov)(\?|$)/i.test(u)) ||
        json.resultUrls?.[0];
      if (!url) throw new Error("No video URL returned");
      return url;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Timed out waiting for kie.ai video");
}
