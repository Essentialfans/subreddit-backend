import {
  clothingInstruction,
  getPromptRecipe,
  recreateFallback,
  type ClothingMode,
  type RecipeContext,
} from "@/lib/generation/prompt-recipes";
import { kieChatComplete } from "@/lib/kie/chat";

export interface PromptBuildInput {
  mode: "presets" | "recreate" | "free";
  userText: string;
  modelName?: string | null;
  /** Catalog id — selects the per-model recipe (wan-3-0, kling-4-0, …) */
  modelId?: string | null;
  presetHint?: string | null;
  enhanceWithAi: boolean;
  refLabels?: string[];
  keepPose?: boolean;
  hasImage?: boolean;
  hasSourceImage?: boolean;
  clothing?: ClothingMode | null;
  durationSec?: number | null;
  aspect?: string | null;
  /** User's kie.ai key — required for live LLM enhance */
  kieApiKey?: string | null;
}

export interface PromptBuildResult {
  prompt: string;
  provider: "kie-chat" | "recipe-fallback" | "passthrough";
  recipeId: string;
  formulaName: string;
  note?: string;
}

function recipeContext(input: PromptBuildInput): RecipeContext {
  return {
    modelName: input.modelName,
    refLabels: input.refLabels,
    hasImage: input.hasImage,
    hasSourceImage: input.hasSourceImage ?? input.mode === "recreate",
    keepPose: input.keepPose,
    durationSec: input.durationSec,
    aspect: input.aspect,
    presetHint: input.presetHint,
    mode: input.mode,
    clothing: input.clothing,
  };
}

function buildUserMessage(input: PromptBuildInput, formulaName: string): string {
  const emptyRecreate =
    input.mode === "recreate" && !input.userText.trim()
      ? "(empty — do NOT invent a new scene; recreate the SOURCE image faithfully)"
      : "(empty — invent a tasteful default scene)";

  const bits = [
    `Target formula: ${formulaName}`,
    `User intent (human language): ${input.userText.trim() || emptyRecreate}`,
  ];
  if (input.modelName) bits.push(`Identity / talent name: ${input.modelName}`);
  if (input.hasImage) {
    bits.push(
      "Reference identity images ARE attached. Preserve that exact person's face, age, hair, and likeness. Never invent a different age from scene stereotypes."
    );
  }
  if (input.mode === "recreate" || input.hasSourceImage) {
    bits.push(
      "RECREATE MODE: Image #1 is the SOURCE still. Recreate that image's scene, background, lighting, and framing. Put the named talent's face onto it using the identity reference images. Do NOT invent a cafe/beach/studio that is not in the source."
    );
    if (input.keepPose !== false) {
      bits.push(
        "Keep pose ON: match SOURCE pose, body position, camera angle, and composition exactly."
      );
    } else {
      bits.push("Keep pose OFF: scene/setting from SOURCE; pose may adjust slightly.");
    }
    const clothes = clothingInstruction(recipeContext(input));
    if (clothes) bits.push(`Clothing rule: ${clothes}`);
  }
  if (input.durationSec) bits.push(`Clip length target: ~${input.durationSec}s`);
  if (input.aspect) bits.push(`Aspect ratio: ${input.aspect}`);
  if (input.presetHint) bits.push(`Preset vibe: ${input.presetHint}`);
  if (input.refLabels?.length) {
    bits.push(`Reference tags: ${input.refLabels.join(", ")}`);
  }
  if (input.keepPose && input.mode !== "recreate") {
    bits.push("Preserve pose/composition from references.");
  }
  if (input.mode === "presets") {
    bits.push(
      "Mode: presets — lean into the preset vibe while staying photoreal when appropriate."
    );
  }
  bits.push(
    "Rewrite into the target model's preferred prompt language. Output the prompt only."
  );
  return bits.join("\n");
}

/** Always re-assert identity after LLM rewrite so scene stereotypes can't override refs. */
function sealIdentity(prompt: string, ctx: RecipeContext): string {
  const name = ctx.modelName?.trim();
  if (!name) return prompt.trim();
  const recreateLock =
    ctx.mode === "recreate" || ctx.hasSourceImage
      ? `Recreate the SOURCE image. Keep ${name}'s exact face, age, hair, and identity from the identity reference images as the sole subject — do not invent a different person or a new location.`
      : ctx.hasImage
        ? `Keep ${name}'s exact face, age, hair, and identity from the reference images as the sole subject — do not invent a different person.`
        : `Featuring ${name} as the sole subject.`;
  const trimmed = prompt.trim();
  if (
    trimmed.toLowerCase().includes("exact face") &&
    trimmed.toLowerCase().includes(name.toLowerCase()) &&
    (ctx.mode !== "recreate" || trimmed.toLowerCase().includes("source"))
  ) {
    return trimmed;
  }
  return `${recreateLock} ${trimmed}`.replace(/\s+/g, " ").trim();
}

/**
 * Expand a short user intent into a model-specific prompt.
 * Uses a dedicated recipe per modelId (never a single shared format).
 * LLM: kie.ai Gemini 3.8 Flash (openai) via the user's BYO kie key.
 */
export async function enhancePrompt(
  input: PromptBuildInput
): Promise<PromptBuildResult> {
  const recipe = getPromptRecipe(input.modelId);
  const ctx = recipeContext(input);
  const text = input.userText.trim();
  const isRecreate = input.mode === "recreate" || Boolean(input.hasSourceImage);

  if (!input.enhanceWithAi) {
    const base = isRecreate
      ? recreateFallback(text, ctx)
      : text || recipe.fallbackExpand("", ctx);
    return {
      prompt: sealIdentity(base, ctx),
      provider: "passthrough",
      recipeId: recipe.id,
      formulaName: recipe.formulaName,
    };
  }

  if (input.kieApiKey) {
    try {
      const raw = await kieChatComplete({
        apiKey: input.kieApiKey,
        system: isRecreate
          ? `${recipe.systemPrompt}

RECREATE OVERRIDE: The first attached image is the SOURCE. You must recreate that source (pose/scene/lighting). Never invent an unrelated setting. Identity refs supply the face only.`
          : recipe.systemPrompt,
        user: buildUserMessage(input, recipe.formulaName),
      });
      return {
        prompt: sealIdentity(raw, ctx),
        provider: "kie-chat",
        recipeId: recipe.id,
        formulaName: recipe.formulaName,
        note: `Enhanced with ${recipe.label} recipe via kie Gemini Flash.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enhancer failed";
      return {
        prompt: isRecreate
          ? recreateFallback(text, ctx)
          : recipe.fallbackExpand(text, ctx),
        provider: "recipe-fallback",
        recipeId: recipe.id,
        formulaName: recipe.formulaName,
        note: `LLM enhance failed (${message}); used ${recipe.label} deterministic recipe.`,
      };
    }
  }

  return {
    prompt: isRecreate
      ? recreateFallback(text, ctx)
      : recipe.fallbackExpand(text, ctx),
    provider: "recipe-fallback",
    recipeId: recipe.id,
    formulaName: recipe.formulaName,
    note: `No kie key for LLM — used ${recipe.label} deterministic recipe.`,
  };
}

/** @deprecated Prefer enhancePrompt — kept for any sync callers */
export function expandPromptStub(input: PromptBuildInput): string {
  const recipe = getPromptRecipe(input.modelId);
  const ctx = recipeContext(input);
  if (input.mode === "recreate" || input.hasSourceImage) {
    return recreateFallback(input.userText, ctx);
  }
  return recipe.fallbackExpand(input.userText, ctx);
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
