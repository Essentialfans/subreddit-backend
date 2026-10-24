export type GenerationMode = "image" | "video";

export type VideoCategory = "prompting" | "motion_control";

export type ImageRefField =
  | "image_url"
  | "image_urls"
  | "reference_image_urls"
  | "input_urls";

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
  badge?: "new";
  blurb: string;
  aspectOptions: string[];
  defaultAspect: string;
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
    imageRefField: "image_urls",
    blurb: "Google’s sharp stills — great first frame for reels.",
    aspectOptions: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    defaultAspect: "9:16",
  },
  {
    id: "nano-banana-2-1",
    label: "Nano Banana 2.1",
    mode: "image",
    model: "nano-banana-2-1",
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
    blurb: "Photoreal punch for ads and creator thumbnails.",
    aspectOptions: ["1:1", "9:16", "16:9", "3:4", "4:3"],
    defaultAspect: "9:16",
  },
  {
    id: "seedream-5-flash",
    label: "Seedream 5.0 Flash",
    mode: "image",
    model: "seedream/5-lite-text-to-image",
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
    blurb: "Reliable workhorse for batch-friendly stills.",
    aspectOptions: ["1:1", "9:16", "16:9"],
    defaultAspect: "9:16",
  },
  {
    id: "nano-banana",
    label: "Nano Banana",
    mode: "image",
    model: "google/nano-banana",
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
  {
    id: "kling-3-motion",
    label: "Kling 3.0 Motion Control",
    mode: "video",
    videoCategory: "motion_control",
    model: "kling-3.0/motion-control",
    imageRefField: "image_url",
    blurb: "Drive character motion from a still + motion reference.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: secRange(3, 30),
    defaultDuration: 5,
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    // Docs send output size via `mode`: 720p | 1080p
    resolutionField: "mode",
    requiresImage: true,
    durationNote: "Motion clip length follows your motion reference (3–30s).",
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
  const slug =
    hasImage && def.imageRefModel ? def.imageRefModel : def.model;

  const input: Record<string, unknown> = {
    prompt: prompt.trim(),
  };

  // Most market models accept aspect_ratio; Veo uses slightly different shapes.
  if (def.id === "veo-3-1") {
    input.aspectRatio = aspect;
    input.model = "veo3_fast";
    if (hasImage) {
      input.imageUrls = uniqueUrls;
    }
  } else if (!(hasImage && def.id === "pixverse-v6-max")) {
    // PixVerse i2v follows source image ratio — skip aspect when image attached.
    input.aspect_ratio = aspect;
  }

  if (resolution) {
    if (def.mode === "image") {
      input.resolution = resolution;
      input.image_size = resolution.toLowerCase();
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
    if (
      field === "image_urls" ||
      field === "reference_image_urls" ||
      field === "input_urls"
    ) {
      input[field] = uniqueUrls;
    } else {
      input[field] = primary;
    }
  }

  if (audioUrl && def.requiresAudio) {
    input.audio_url = audioUrl;
  }

  return { model: slug, input };
}
