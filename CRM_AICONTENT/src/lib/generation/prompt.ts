export interface PromptBuildInput {
  mode: "presets" | "recreate" | "free";
  userText: string;
  modelName?: string | null;
  presetHint?: string | null;
  enhanceWithAi: boolean;
  refLabels?: string[];
  keepPose?: boolean;
}

/**
 * Expand a short user intent into a fuller image prompt.
 * LLM wiring comes later — this is a deterministic stub that still
 * locks the selected identity into the prompt.
 */
export function expandPromptStub(input: PromptBuildInput): string {
  const text = input.userText.trim();
  const name = input.modelName?.trim();
  const identity = name
    ? `Featuring ${name} as the sole subject, matching their reference identity and facial likeness.`
    : "Keep subject identity consistent with the attached reference images.";

  const refs =
    input.refLabels && input.refLabels.length
      ? `Use uploaded references ${input.refLabels.join(", ")} where tagged.`
      : "";

  if (input.mode === "presets") {
    const vibe = input.presetHint ?? "lifestyle portrait";
    const scene = text || "natural candid moment";
    return [
      identity,
      `Scene: ${scene}.`,
      `Style direction: ${vibe}.`,
      "Photoreal, Instagram-ready, clean lighting, sharp facial detail.",
      input.keepPose ? "Preserve pose and composition from references." : "",
      refs,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (input.mode === "recreate") {
    return [
      identity,
      "Recreate the source image composition with the selected identity.",
      text ? `Guidance for changes: ${text}.` : "Keep wardrobe and framing close to the source unless noted.",
      input.keepPose ? "Strictly keep pose and composition." : "",
      refs,
    ]
      .filter(Boolean)
      .join(" ");
  }

  // free
  const cleaned = text
    .replace(/@[\w-]+/g, (tag) => {
      // leave readable mention for models/refs
      return tag;
    })
    .trim();

  if (!input.enhanceWithAi) {
    return [cleaned, identity, refs].filter(Boolean).join(" ");
  }

  return [
    identity,
    cleaned
      ? `Creative direction: ${cleaned}.`
      : "Tasteful lifestyle portrait, vertical framing.",
    "High detail face, natural skin texture, coherent lighting, no extra people.",
    refs,
  ]
    .filter(Boolean)
    .join(" ");
}

export function parseAtMentions(text: string): {
  modelSlugs: string[];
  refTags: string[];
} {
  const modelSlugs: string[] = [];
  const refTags: string[] = [];
  const re = /@([a-zA-Z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tag = m[1];
    if (/^ref\d+$/i.test(tag)) {
      refTags.push(tag.toLowerCase());
    } else {
      modelSlugs.push(tag.toLowerCase());
    }
  }
  return {
    modelSlugs: [...new Set(modelSlugs)],
    refTags: [...new Set(refTags)],
  };
}
