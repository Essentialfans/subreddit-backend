export type GenerationMode = "image" | "video";

export type VideoCategory = "prompting" | "motion_control";

export type ImageRefField =
  | "image_url"
  | "image_urls"
  | "image_input"
  | "reference_image_urls"
  | "input_urls";

export type VideoRefField = "video_url" | "video_urls";

/** How resolution is sent to kie.ai for this model */
export type ResolutionField = "resolution" | "quality" | "mode";

export interface KieModel {
  id: string;
  label: string;
  mode: GenerationMode;
  /** Default kie.ai model slug for text-only generation */
  model: string;
  /** Prefer this slug when a reference image is attached */
  imageRefModel?: string;
  imageRefField?: ImageRefField;
  /** Motion-control: field for the driving video URL */
  videoRefField?: VideoRefField;
  badge?: "new";
  blurb: string;
  aspectOptions: string[];
  defaultAspect: string;
  /** Skip aspect_ratio in payload (some motion APIs don't accept it) */
  omitAspect?: boolean;
  /** Video-only extras */
  videoCategory?: VideoCategory;
  /** Allowed clip lengths in seconds (from kie.ai docs). Empty = driven by audio/input. */
  durations?: number[];
  defaultDuration?: number;
  /** Allowed output resolutions for this model (display form, e.g. 720p) */
  resolutions?: string[];
  defaultResolution?: string;
  /** API field name for resolution */
  resolutionField?: ResolutionField;
  /** Some APIs want 720P / 1080P instead of 720p */
  resolutionCase?: "lower" | "upper";
  /** Some APIs expect duration as a string */
  durationAsString?: boolean;
  requiresImage?: boolean;
  requiresAudio?: boolean;
  /** Needs a motion-reference video (Kling Motion / Wan Animate) */
  requiresMotionVideo?: boolean;
  /** Prompt is optional (motion APIs often drive from video alone) */
  promptOptional?: boolean;
  /** Never send prompt — API schema has no prompt field (e.g. Wan Animate Move) */
  omitPrompt?: boolean;
  /** Extra note shown under duration when special */
  durationNote?: string;
}

/** Inclusive integer seconds list for UI selectors */
export function secRange(min: number, max: number): number[] {
  const out: number[] = [];
  for (let s = min; s <= max; s += 1) out.push(s);
  return out;
}

export function formatResolutionForApi(
  value: string,
  model: KieModel
): string {
  // MiniMax H3 API: 768P / 1080P (UI shows nearest 720p / 1080p)
  if (model.id === "minimax-h3") {
    const v = value.toLowerCase();
    if (v === "720p" || v === "480p") return "768P";
    if (v === "1080p") return "1080P";
  }
  // Seedream family: UI 1K/2K → API quality basic/high
  if (model.id.startsWith("seedream")) {
    const v = value.toUpperCase();
    if (v === "2K" || v === "4K" || v === "HIGH") return "high";
    return "basic";
  }
  // PixVerse quality enum is lowercase; 480p maps to nearest 540p
  if (model.resolutionField === "quality") {
    const v = value.toLowerCase();
    if (v === "480p") return "540p";
    return v;
  }
  if (model.resolutionCase === "upper") {
    return value.toUpperCase();
  }
  return value.toLowerCase();
}

function isSeedreamModel(def: KieModel): boolean {
  return def.id.startsWith("seedream");
}

export function videoModelsByCategory(category: VideoCategory): KieModel[] {
  return VIDEO_MODELS.filter((m) => m.videoCategory === category);
}

export const VIDEO_CATEGORY_LABELS: Record<VideoCategory, string> = {
  prompting: "Prompting video",
  motion_control: "Motion control",
};

export const IMAGE_MODELS: KieModel[] = [
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    mode: "image",
    model: "nano-banana-pro",
    // kie docs: identity refs go in image_input (NOT image_urls)
    imageRefField: "image_input",
    blurb: "Google’s sharp stills — great first frame for reels.",
    aspectOptions: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    defaultAspect: "9:16",
  },
  {
    id: "nano-banana-2-1",
    label: "Nano Banana 2.1",
    mode: "image",
    model: "nano-banana-2",
    imageRefField: "image_input",
    blurb: "Fast, clean product and lifestyle frames.",
    aspectOptions: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    defaultAspect: "9:16",
  },
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    mode: "image",
    model: "gpt-image-2-text-to-image",
    blurb: "Prompt-faithful compositions with strong text handling.",
    aspectOptions: ["1:1", "9:16", "16:9"],
    defaultAspect: "9:16",
  },
  {
    id: "gpt-image-2-5",
    label: "GPT Image 2.5",
    mode: "image",
    model: "gpt-image-2-5-flare-text-to-image",
    blurb: "Higher-fidelity stills when detail matters.",
    aspectOptions: ["1:1", "9:16", "16:9"],
    defaultAspect: "9:16",
  },
  {
    id: "seedream-5-pro",
    label: "Seedream 5.0 Pro",
    mode: "image",
    model: "seedream/5-pro-text-to-image",
    imageRefModel: "seedream/5-pro-image-to-image",
    imageRefField: "image_urls",
    // kie requires quality: basic (1K) | high (2K) — not resolution
    resolutionField: "quality",
    resolutions: ["1K", "2K"],
    defaultResolution: "1K",
    blurb: "Photoreal punch for ads and creator thumbnails.",
    aspectOptions: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    defaultAspect: "9:16",
  },
  {
    id: "seedream-5-flash",
    label: "Seedream 5.0 Flash",
    mode: "image",
    model: "seedream/5-lite-text-to-image",
    imageRefModel: "seedream/5-lite-image-to-image",
    imageRefField: "image_urls",
    resolutionField: "quality",
    resolutions: ["1K", "2K"],
    defaultResolution: "1K",
    blurb: "Quicker Seedream pass for ideation loops.",
    aspectOptions: ["1:1", "9:16", "16:9"],
    defaultAspect: "9:16",
  },
  {
    id: "flux-3-klein",
    label: "Flux 3 Klein",
    mode: "image",
    model: "flux-3/klein-text-to-image",
    blurb: "Crisp graphic looks with strong prompt control.",
    aspectOptions: ["1:1", "9:16", "16:9"],
    defaultAspect: "9:16",
  },
  {
    id: "seedream-4-5",
    label: "Seedream 4.5",
    mode: "image",
    model: "seedream/4.5-text-to-image",
    imageRefModel: "seedream/4.5-image-to-image",
    imageRefField: "image_urls",
    resolutionField: "quality",
    resolutions: ["1K", "2K"],
    defaultResolution: "1K",
    blurb: "Reliable workhorse for batch-friendly stills.",
    aspectOptions: ["1:1", "9:16", "16:9"],
    defaultAspect: "9:16",
  },
  {
    id: "nano-banana",
    label: "Nano Banana",
    mode: "image",
    model: "google/nano-banana",
    imageRefField: "image_input",
    blurb: "Lightweight Google stills for quick drafts.",
    aspectOptions: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    defaultAspect: "9:16",
  },
];

export const VIDEO_MODELS: KieModel[] = [
  // —— Prompting video ——
  {
    id: "seedance-2-5",
    label: "Seedance 2.5",
    mode: "video",
    videoCategory: "prompting",
    model: "bytedance/seedance-2-5",
    imageRefModel: "bytedance/seedance-2-5",
    imageRefField: "reference_image_urls",
    blurb: "ByteDance — smooth camera and subject move.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: secRange(4, 30),
    defaultDuration: 5,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
  },
  {
    id: "seedance-2-0",
    label: "Seedance 2.0",
    mode: "video",
    videoCategory: "prompting",
    model: "bytedance/seedance-2",
    imageRefField: "reference_image_urls",
    blurb: "Stable Seedance baseline for social clips.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: secRange(4, 15),
    defaultDuration: 5,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
  },
  {
    id: "kling-4-0",
    label: "Kling 4.0",
    mode: "video",
    videoCategory: "prompting",
    model: "kling-4.0/reference-to-video",
    imageRefModel: "kling-4.0/reference-to-video",
    imageRefField: "image_urls",
    badge: "new",
    blurb: "Newest Kling — reference-driven cinematic motion.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: secRange(3, 30),
    defaultDuration: 10,
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
  },
  {
    id: "grok-imagine-video",
    label: "Grok Imagine Video 1.5",
    mode: "video",
    videoCategory: "prompting",
    model: "grok-imagine/text-to-video",
    imageRefModel: "grok-imagine/image-to-video",
    imageRefField: "image_url",
    blurb: "Text or still → video with synced audio bed.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: secRange(6, 30),
    defaultDuration: 6,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
    durationAsString: true,
  },
  {
    id: "kling-3-0",
    label: "Kling 3.0",
    mode: "video",
    videoCategory: "prompting",
    model: "kling-3.0/video",
    imageRefField: "image_urls",
    blurb: "Multi-shot Kling with strong subject hold.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: secRange(3, 15),
    defaultDuration: 5,
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
  },
  {
    id: "kling-3-turbo",
    label: "Kling 3.0 Turbo",
    mode: "video",
    videoCategory: "prompting",
    model: "kling/v3-turbo-text-to-video",
    imageRefModel: "kling/v3-turbo-image-to-video",
    imageRefField: "image_url",
    blurb: "Faster Kling pass when you’re iterating.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: secRange(3, 15),
    defaultDuration: 5,
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
    durationAsString: true,
  },
  {
    id: "wan-3-0",
    label: "Wan 3.0",
    mode: "video",
    videoCategory: "prompting",
    model: "wan/3-0-video",
    imageRefField: "image_url",
    blurb: "Wan’s latest general video model (up to 30s).",
    aspectOptions: ["9:16", "16:9", "1:1", "4:3", "3:4"],
    defaultAspect: "9:16",
    durations: secRange(2, 30),
    defaultDuration: 5,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "1080p",
    resolutionField: "resolution",
    resolutionCase: "upper",
  },
  {
    id: "wan-3-prime",
    label: "Wan 3.0 Prime",
    mode: "video",
    videoCategory: "prompting",
    model: "wan/3-0-video-prime",
    imageRefField: "image_url",
    blurb: "Higher-speed Wan for quick cutdowns (up to 30s).",
    aspectOptions: ["9:16", "16:9", "1:1", "4:3", "3:4"],
    defaultAspect: "9:16",
    durations: secRange(2, 30),
    defaultDuration: 5,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "1080p",
    resolutionField: "resolution",
    resolutionCase: "upper",
  },
  {
    id: "gemini-omni-flash",
    label: "Gemini Omni 1.1 Flash",
    mode: "video",
    videoCategory: "prompting",
    model: "google/gemini-omni-flash-1-1",
    imageRefField: "image_urls",
    blurb: "Multimodal Google flash video generation.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [4, 6, 8, 10],
    defaultDuration: 6,
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
    durationAsString: true,
  },
  {
    id: "minimax-h3",
    label: "MiniMax H3",
    mode: "video",
    videoCategory: "prompting",
    model: "minimax-h3/text-to-video",
    imageRefModel: "minimax-h3/image-to-video",
    imageRefField: "image_url",
    blurb: "Cinematic clips with native stereo audio.",
    aspectOptions: ["9:16", "16:9", "1:1", "4:3", "3:4"],
    defaultAspect: "9:16",
    durations: secRange(4, 15),
    defaultDuration: 6,
    // API uses 768P / 2K — surface closest UI labels
    resolutions: ["720p", "1080p"],
    defaultResolution: "1080p",
    resolutionField: "resolution",
  },
  {
    id: "happyhorse-1-1",
    label: "HappyHorse 1.1",
    mode: "video",
    videoCategory: "prompting",
    model: "happyhorse-1-1/text-to-video",
    imageRefModel: "happyhorse-1-1/image-to-video",
    imageRefField: "image_url",
    blurb: "Snappy social motion with punchy lighting.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: secRange(3, 15),
    defaultDuration: 5,
    resolutions: ["720p", "1080p"],
    defaultResolution: "1080p",
    resolutionField: "resolution",
  },
  {
    id: "veo-3-1",
    label: "Veo 3.1",
    mode: "video",
    videoCategory: "prompting",
    model: "veo-3-1",
    imageRefField: "image_urls",
    blurb: "Google Veo — quality / fast / lite via kie.ai.",
    aspectOptions: ["9:16", "16:9"],
    defaultAspect: "9:16",
    durations: [4, 6, 8],
    defaultDuration: 8,
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
  },
  {
    id: "vidu-q4",
    label: "Vidu Q4",
    mode: "video",
    videoCategory: "prompting",
    model: "vidu-q4/image-to-video",
    imageRefField: "image_url",
    blurb: "Image-to-video specialist for still → motion.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: secRange(3, 16),
    defaultDuration: 5,
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
    requiresImage: true,
  },
  {
    id: "pixverse-v6-max",
    label: "PixVerse V6 Max",
    mode: "video",
    videoCategory: "prompting",
    model: "pixverse-v6-max/text-to-video",
    imageRefModel: "pixverse-v6-max/image-to-video",
    imageRefField: "image_url",
    blurb: "Up to 15s cinematic clips, optional native audio.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: secRange(1, 15),
    defaultDuration: 5,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "quality",
  },
  // —— Motion control ——
  // Note: Wan 3.0 is prompting video only. Wan motion transfer on kie is Animate Move (2.2).
  {
    id: "wan-animate-move",
    label: "Wan Animate Move",
    mode: "video",
    videoCategory: "motion_control",
    model: "wan/2-2-animate-move",
    imageRefField: "image_url",
    videoRefField: "video_url",
    blurb: "Transfer motion from a reference video onto your still (Wan Animate).",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    omitAspect: true,
    durations: [],
    resolutions: ["720p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
    requiresImage: true,
    requiresMotionVideo: true,
    promptOptional: true,
    omitPrompt: true,
    durationNote:
      "Clip length matches your motion-reference video. (Wan 3.0 is prompting-only — this is Wan Animate Move.)",
  },
  {
    id: "kling-3-motion",
    label: "Kling 3.0 Motion Control",
    mode: "video",
    videoCategory: "motion_control",
    model: "kling-3.0/motion-control",
    // kie docs: input_urls (image) + video_urls (motion clip)
    imageRefField: "input_urls",
    videoRefField: "video_urls",
    blurb: "Drive character motion from a still + motion reference.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    omitAspect: true,
    durations: [],
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "mode",
    requiresImage: true,
    requiresMotionVideo: true,
    promptOptional: true,
    durationNote:
      "Clip length matches your motion-reference video (about 3–30s).",
  },
  {
    id: "omnihuman-2-0",
    label: "OmniHuman 2.0",
    mode: "video",
    videoCategory: "motion_control",
    model: "omnihuman-2-0",
    imageRefField: "image_url",
    blurb: "Talking-character performance from image + audio.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [],
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    resolutionField: "resolution",
    requiresImage: true,
    requiresAudio: true,
    durationNote: "Length follows the audio (about 4–300s).",
  },
];

export function modelsForMode(mode: GenerationMode): KieModel[] {
  return mode === "image" ? IMAGE_MODELS : VIDEO_MODELS;
}

export function findModel(id: string): KieModel | undefined {
  return [...IMAGE_MODELS, ...VIDEO_MODELS].find((m) => m.id === id);
}

export function buildKieInput(options: {
  model: KieModel;
  prompt: string;
  aspect: string;
  duration?: number;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  resolution?: string | null;
}): { model: string; input: Record<string, unknown> } {
  const { model: def, prompt, aspect, duration, audioUrl, resolution } = options;
  const urls = [
    ...(options.imageUrls ?? []),
    ...(options.imageUrl ? [options.imageUrl] : []),
  ].filter(Boolean) as string[];
  const uniqueUrls = [...new Set(urls)];
  const hasImage = uniqueUrls.length > 0;
  const primary = uniqueUrls[0];
  const motionVideo = options.videoUrl?.trim() || "";
  const slug =
    hasImage && def.imageRefModel ? def.imageRefModel : def.model;

  const input: Record<string, unknown> = {};
  const trimmedPrompt = prompt.trim();
  // Wan Animate Move (and similar) reject unknown fields like prompt → "Internal Error".
  if (!def.omitPrompt) {
    if (trimmedPrompt) {
      input.prompt = trimmedPrompt;
    } else if (!def.promptOptional) {
      input.prompt = "";
    }
  }

  // Most market models accept aspect_ratio; Veo uses slightly different shapes.
  // Motion-control APIs (Kling Motion / Wan Animate) omit aspect.
  if (def.id === "veo-3-1") {
    input.aspectRatio = aspect;
    input.model = "veo3_fast";
    if (hasImage) {
      input.imageUrls = uniqueUrls;
    }
  } else if (
    !def.omitAspect &&
    !(hasImage && def.id === "pixverse-v6-max")
  ) {
    // PixVerse i2v follows source image ratio — skip aspect when image attached.
    input.aspect_ratio = aspect;
  }

  if (resolution) {
    if (isSeedreamModel(def)) {
      // Seedream requires `quality`: basic ≈ 1K, high ≈ 2K (not a resolution string).
      input.quality = formatResolutionForApi(resolution, def);
      input.output_format = "png";
    } else if (def.mode === "image") {
      // Nano Banana family uses 1K/2K/4K on `resolution` only.
      input.resolution = resolution;
      if (!def.id.startsWith("nano-banana")) {
        input.image_size = resolution.toLowerCase();
      }
    } else {
      const field = def.resolutionField ?? "resolution";
      const apiRes = formatResolutionForApi(resolution, def);
      if (field === "quality") {
        input.quality = apiRes;
      } else if (field === "mode") {
        input.mode = apiRes;
      } else {
        input.resolution = apiRes;
      }
    }
  } else if (isSeedreamModel(def)) {
    // quality is required even when UI omits resolution
    input.quality = "basic";
    input.output_format = "png";
  }

  if (
    def.mode === "video" &&
    typeof duration === "number" &&
    duration > 0 &&
    (def.durations?.length ?? 0) > 0
  ) {
    input.duration = def.durationAsString ? String(duration) : duration;
  }

  if (hasImage && primary && def.id !== "veo-3-1") {
    const field = def.imageRefField ?? "image_url";
    // Motion-control APIs accept exactly one still (input_urls max 1 / image_url).
    const imagePayload =
      def.requiresMotionVideo || field === "input_urls" || field === "image_url"
        ? [primary]
        : uniqueUrls;
    if (
      field === "image_urls" ||
      field === "image_input" ||
      field === "reference_image_urls" ||
      field === "input_urls"
    ) {
      input[field] = def.requiresMotionVideo ? [primary] : imagePayload;
    } else {
      input[field] = primary;
    }
  }

  // Nano Banana Pro docs ask for output_format explicitly.
  if (def.id.startsWith("nano-banana") || def.id === "nano-banana") {
    input.output_format = "png";
  }

  if (motionVideo && def.videoRefField) {
    if (def.videoRefField === "video_urls") {
      input.video_urls = [motionVideo];
    } else {
      input.video_url = motionVideo;
    }
  }

  if (audioUrl && def.requiresAudio) {
    input.audio_url = audioUrl;
  }

  // Kling Motion: character orientation defaults to video
  if (def.id === "kling-3-motion") {
    input.character_orientation = "video";
  }

  return { model: slug, input };
}
