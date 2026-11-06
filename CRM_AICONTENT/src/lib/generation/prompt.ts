import {
  getPromptRecipe,
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
    durationSec: input.durationSec,
    aspect: input.aspect,
    presetHint: input.presetHint,
    mode: input.mode,
  };
}

function buildUserMessage(input: PromptBuildInput, formulaName: string): string {
  const bits = [
    `Target formula: ${formulaName}`,
    `User intent (human language): ${input.userText.trim() || "(empty — invent a tasteful default scene)"}`,
  ];
  if (input.modelName) bits.push(`Identity / talent name: ${input.modelName}`);
  if (input.hasImage) bits.push("A reference / source still is attached (image-to-video or img2img).");
  if (input.durationSec) bits.push(`Clip length target: ~${input.durationSec}s`);
  if (input.aspect) bits.push(`Aspect ratio: ${input.aspect}`);
  if (input.presetHint) bits.push(`Preset vibe: ${input.presetHint}`);
  if (input.refLabels?.length) {
    bits.push(`Reference tags: ${input.refLabels.join(", ")}`);
  }
  if (input.keepPose) bits.push("Preserve pose/composition from references.");
  if (input.mode === "recreate") {
    bits.push("Mode: recreate — keep composition close to the source still.");
  }
  if (input.mode === "presets") {
    bits.push("Mode: presets — lean into the preset vibe while staying photoreal when appropriate.");
  }
  bits.push("Rewrite into the target model's preferred prompt language. Output the prompt only.");
  return bits.join("\n");
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

  if (!input.enhanceWithAi) {
    const passthrough = [text, ctx.modelName ? `Featuring ${ctx.modelName}.` : ""]
      .filter(Boolean)
      .join(" ");
    return {
      prompt: passthrough || recipe.fallbackExpand("", ctx),
      provider: "passthrough",
      recipeId: recipe.id,
      formulaName: recipe.formulaName,
    };
  }

  if (input.kieApiKey) {
    try {
      const prompt = await kieChatComplete({
        apiKey: input.kieApiKey,
        system: recipe.systemPrompt,
        user: buildUserMessage(input, recipe.formulaName),
      });
      return {
        prompt,
        provider: "kie-chat",
        recipeId: recipe.id,
        formulaName: recipe.formulaName,
        note: `Enhanced with ${recipe.label} recipe via kie Gemini Flash.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Enhancer failed";
      return {
        prompt: recipe.fallbackExpand(text, ctx),
        provider: "recipe-fallback",
        recipeId: recipe.id,
        formulaName: recipe.formulaName,
        note: `LLM enhance failed (${message}); used ${recipe.label} deterministic recipe.`,
      };
    }
  }

  return {
    prompt: recipe.fallbackExpand(text, ctx),
    provider: "recipe-fallback",
    recipeId: recipe.id,
    formulaName: recipe.formulaName,
    note: `No kie key for LLM — used ${recipe.label} deterministic recipe.`,
  };
}

/** @deprecated Prefer enhancePrompt — kept for any sync callers */
export function expandPromptStub(input: PromptBuildInput): string {
  const recipe = getPromptRecipe(input.modelId);
  return recipe.fallbackExpand(input.userText, recipeContext(input));
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
