export type GenerationMode = "image" | "video";

export type ImageRefField =
  | "image_url"
  | "image_urls"
  | "reference_image_urls"
  | "input_urls";

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
  durations?: number[];
  defaultDuration?: number;
  requiresImage?: boolean;
  requiresAudio?: boolean;
}

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
  {
    id: "seedance-2-5",
    label: "Seedance 2.5",
    mode: "video",
    model: "bytedance/seedance-2-5",
    imageRefModel: "bytedance/seedance-2-5",
    imageRefField: "reference_image_urls",
    blurb: "ByteDance motion — smooth camera and subject move.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 10],
    defaultDuration: 5,
  },
  {
    id: "seedance-2-0",
    label: "Seedance 2.0",
    mode: "video",
    model: "bytedance/seedance-2",
    imageRefField: "reference_image_urls",
    blurb: "Stable Seedance baseline for social clips.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 10],
    defaultDuration: 5,
  },
  {
    id: "kling-4-0",
    label: "Kling 4.0",
    mode: "video",
    model: "kling-4.0/reference-to-video",
    imageRefModel: "kling-4.0/reference-to-video",
    imageRefField: "image_urls",
    badge: "new",
    blurb: "Newest Kling — reference-driven cinematic motion.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 10],
    defaultDuration: 5,
  },
  {
    id: "grok-imagine-video",
    label: "Grok Imagine Video 1.5",
    mode: "video",
    model: "grok-imagine/text-to-video",
    imageRefModel: "grok-imagine/image-to-video",
    imageRefField: "image_url",
    blurb: "Text or still → video with synced audio bed.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [6, 10],
    defaultDuration: 6,
  },
  {
    id: "kling-3-0",
    label: "Kling 3.0",
    mode: "video",
    model: "kling-3.0/video",
    imageRefField: "image_urls",
    blurb: "Multi-shot Kling with strong subject hold.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 10],
    defaultDuration: 5,
  },
  {
    id: "kling-3-turbo",
    label: "Kling 3.0 Turbo",
    mode: "video",
    model: "kling/v3-turbo-text-to-video",
    imageRefModel: "kling/v3-turbo-image-to-video",
    imageRefField: "image_url",
    blurb: "Faster Kling pass when you’re iterating.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 10],
    defaultDuration: 5,
  },
  {
    id: "kling-3-motion",
    label: "Kling 3.0 Motion Control",
    mode: "video",
    model: "kling-3.0/motion-control",
    imageRefField: "image_url",
    blurb: "Guide motion from a still — performance control.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 10],
    defaultDuration: 5,
    requiresImage: true,
  },
  {
    id: "wan-3-0",
    label: "Wan 3.0",
    mode: "video",
    model: "wan/3-0-video",
    imageRefField: "image_url",
    blurb: "Wan’s latest general video model.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 10],
    defaultDuration: 5,
  },
  {
    id: "wan-3-prime",
    label: "Wan 3.0 Prime",
    mode: "video",
    model: "wan/3-0-video-prime",
    imageRefField: "image_url",
    blurb: "Higher-speed Wan for quick cutdowns.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 10],
    defaultDuration: 5,
  },
  {
    id: "gemini-omni-flash",
    label: "Gemini Omni 1.1 Flash",
    mode: "video",
    model: "google/gemini-omni-flash-1-1",
    imageRefField: "image_urls",
    blurb: "Multimodal Google flash video generation.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 8],
    defaultDuration: 5,
  },
  {
    id: "minimax-h3",
    label: "MiniMax H3",
    mode: "video",
    model: "minimax-h3/text-to-video",
    imageRefModel: "minimax-h3/image-to-video",
    imageRefField: "image_url",
    blurb: "Cinematic clips with native stereo audio.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [6, 10],
    defaultDuration: 6,
  },
  {
    id: "happyhorse-1-1",
    label: "HappyHorse 1.1",
    mode: "video",
    model: "happyhorse-1-1/text-to-video",
    imageRefModel: "happyhorse-1-1/image-to-video",
    imageRefField: "image_url",
    blurb: "Snappy social motion with punchy lighting.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 10],
    defaultDuration: 5,
  },
  {
    id: "veo-3-1",
    label: "Veo 3.1",
    mode: "video",
    model: "veo-3-1",
    imageRefField: "image_urls",
    blurb: "Google Veo — quality / fast / lite via kie.ai.",
    aspectOptions: ["9:16", "16:9"],
    defaultAspect: "9:16",
    durations: [6, 8],
    defaultDuration: 6,
  },
  {
    id: "omnihuman-2-0",
    label: "OmniHuman 2.0",
    mode: "video",
    model: "omnihuman-2-0",
    imageRefField: "image_url",
    blurb: "Talking-character video from image + audio.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    requiresImage: true,
    requiresAudio: true,
  },
  {
    id: "vidu-q4",
    label: "Vidu Q4",
    mode: "video",
    model: "vidu-q4/image-to-video",
    imageRefField: "image_url",
    blurb: "Image-to-video specialist for still → motion.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 8],
    defaultDuration: 5,
    requiresImage: true,
  },
  {
    id: "pixverse-v6-max",
    label: "PixVerse V6 Max",
    mode: "video",
    model: "pixverse-v6-max/text-to-video",
    imageRefModel: "pixverse-v6-max/image-to-video",
    imageRefField: "image_url",
    blurb: "Up to 15s cinematic clips, optional native audio.",
    aspectOptions: ["9:16", "16:9", "1:1"],
    defaultAspect: "9:16",
    durations: [5, 8, 10, 15],
    defaultDuration: 5,
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
  audioUrl?: string | null;
}): { model: string; input: Record<string, unknown> } {
  const { model: def, prompt, aspect, duration, imageUrl, audioUrl } = options;
  const hasImage = Boolean(imageUrl);
  const slug =
    hasImage && def.imageRefModel ? def.imageRefModel : def.model;

  const input: Record<string, unknown> = {
    prompt: prompt.trim(),
  };

  // Most market models accept aspect_ratio; Veo uses slightly different shapes.
  if (def.id === "veo-3-1") {
    input.aspectRatio = aspect;
    input.model = "veo3_fast";
    if (hasImage && imageUrl) {
      input.imageUrls = [imageUrl];
    }
  } else if (!(hasImage && def.id === "pixverse-v6-max")) {
    // PixVerse i2v follows source image ratio — skip aspect when image attached.
    input.aspect_ratio = aspect;
  }

  if (def.mode === "video" && duration) {
    input.duration = duration;
  }

  if (hasImage && imageUrl && def.id !== "veo-3-1") {
    const field = def.imageRefField ?? "image_url";
    if (field === "image_urls" || field === "reference_image_urls" || field === "input_urls") {
      input[field] = [imageUrl];
    } else {
      input[field] = imageUrl;
    }
  }

  if (audioUrl && def.requiresAudio) {
    input.audio_url = audioUrl;
  }

  return { model: slug, input };
}
