export type GenerateMode = "presets" | "recreate" | "free";

export interface PresetCategory {
  id: string;
  label: string;
  promptHint: string;
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: "homebody",
    label: "Homebody",
    promptHint: "cozy at-home lifestyle, soft natural light, casual loungewear",
  },
  {
    id: "after-dark",
    label: "After Dark",
    promptHint: "moody night lighting, city glow, elegant evening look",
  },
  {
    id: "flirty-fits",
    label: "Flirty Fits",
    promptHint: "playful fashion pose, flattering outfit, studio catchlights",
  },
  {
    id: "steam-glow",
    label: "Steam & Glow",
    promptHint: "warm dewy skin, soft steam atmosphere, intimate bathroom glow",
  },
  {
    id: "selfie-mode",
    label: "Selfie Mode",
    promptHint: "handheld selfie angle, natural phone camera look, close-up",
  },
  {
    id: "bedroom-glow",
    label: "Bedroom Glow",
    promptHint: "bedroom morning light through curtains, relaxed authentic moment",
  },
  {
    id: "real-moments",
    label: "Real Moments",
    promptHint: "candid documentary feel, unposed, lifestyle authenticity",
  },
  {
    id: "fit-check",
    label: "Fit Check",
    promptHint: "full-body outfit check, mirror or standing pose, fashion clarity",
  },
  {
    id: "street-style",
    label: "Street Style",
    promptHint: "urban street fashion, daylight sidewalks, editorial movement",
  },
];

export const RATIO_OPTIONS = [
  { id: "1:1", label: "Square · 1:1", icon: "square" },
  { id: "3:4", label: "Photo · 3:4", icon: "portrait" },
  { id: "4:3", label: "4:3", icon: "landscape" },
  { id: "4:5", label: "Portrait · 4:5", icon: "portrait" },
  { id: "5:4", label: "5:4", icon: "landscape" },
  { id: "9:16", label: "Story · 9:16", icon: "story" },
  { id: "16:9", label: "Landscape · 16:9", icon: "wide" },
] as const;

export const RESOLUTION_OPTIONS = [
  { id: "1K", label: "1K" },
  { id: "2K", label: "2K" },
  { id: "4K", label: "4K" },
] as const;

export const RECREATE_GEN_MODELS = [
  {
    id: "seedream-5-pro",
    label: "Seedream 5 Pro",
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
  },
] as const;

export const PRESET_QUALITY = [
  { id: "seedream-4-5", label: "Seedream" },
  { id: "seedream-5-pro", label: "Seedream Pro" },
] as const;
