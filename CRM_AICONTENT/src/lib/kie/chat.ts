const KIE_BASE = "https://api.kie.ai";

/**
 * Fast enhancer LLM via the user's existing kie.ai key.
 * OpenAI-compatible chat completions endpoint.
 */
export const ENHANCE_CHAT_MODEL = "gemini-3-8-flash-openai";
const ENHANCE_CHAT_PATH = `/${ENHANCE_CHAT_MODEL}/v1/chat/completions`;

export async function kieChatComplete(options: {
  apiKey: string;
  system: string;
  user: string;
  temperature?: number;
}): Promise<string> {
  const response = await fetch(`${KIE_BASE}${ENHANCE_CHAT_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ENHANCE_CHAT_MODEL,
      temperature: options.temperature ?? 0.4,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      stream: false,
    }),
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    message?: string;
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  } | null;

  if (!response.ok) {
    throw new Error(
      json?.msg ||
        json?.message ||
        json?.error?.message ||
        `kie chat HTTP ${response.status}`
    );
  }

  // Some kie chat routes return business errors with HTTP 200
  if (typeof json?.code === "number" && json.code !== 200) {
    throw new Error(json.msg || json.message || `kie chat error ${json.code}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content.map((p) => p.text ?? "").join("");
  }

  text = text.trim();
  if (!text) {
    throw new Error("Enhancer returned an empty prompt");
  }

  // Strip accidental markdown fences
  return text
    .replace(/^```(?:text|markdown|prompt)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
