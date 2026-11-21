const KIE_BASE = "https://api.kie.ai";

export interface KieCreateTaskResult {
  taskId: string;
  raw: unknown;
}

export interface KieTaskInfo {
  taskId: string;
  state: string;
  resultUrls: string[];
  failMsg?: string;
  raw: unknown;
}

async function kieFetch(
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetch(`${KIE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    message?: string;
    data?: unknown;
  } | null;

  if (!response.ok) {
    throw new Error(
      json?.msg || json?.message || `kie.ai HTTP ${response.status}`
    );
  }

  if (json && typeof json.code === "number" && json.code !== 200) {
    throw new Error(json.msg || json.message || `kie.ai error ${json.code}`);
  }

  return json?.data ?? json;
}

export async function createKieTask(
  apiKey: string,
  body: { model: string; input: Record<string, unknown>; callBackUrl?: string }
): Promise<KieCreateTaskResult> {
  const data = (await kieFetch(apiKey, "/api/v1/jobs/createTask", {
    method: "POST",
    body: JSON.stringify(body),
  })) as { taskId?: string };

  if (!data?.taskId) {
    throw new Error("kie.ai did not return a taskId");
  }

  return { taskId: data.taskId, raw: data };
}

function collectUrls(value: unknown, out: string[]) {
  if (!value) return;
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out);
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (
        /url|result|output|video|image|cover/i.test(key) ||
        typeof nested === "object"
      ) {
        collectUrls(nested, out);
      }
    }
  }
}

export async function getKieTask(
  apiKey: string,
  taskId: string
): Promise<KieTaskInfo> {
  const data = (await kieFetch(
    apiKey,
    `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`
  )) as Record<string, unknown>;

  const state = String(
    data.state ?? data.status ?? data.taskStatus ?? "unknown"
  ).toLowerCase();

  const urls: string[] = [];
  collectUrls(data.resultJson ?? data.resultUrls ?? data.result ?? data, urls);

  // resultJson is often a JSON string
  if (typeof data.resultJson === "string") {
    try {
      collectUrls(JSON.parse(data.resultJson), urls);
    } catch {
      // ignore
    }
  }

  const unique = [...new Set(urls)];

  return {
    taskId,
    state,
    resultUrls: unique,
    failMsg:
      typeof data.failMsg === "string"
        ? data.failMsg
        : typeof data.errorMessage === "string"
          ? data.errorMessage
          : undefined,
    raw: data,
  };
}

export async function validateKieKey(apiKey: string): Promise<boolean> {
  try {
    await kieFetch(apiKey, "/api/v1/chat/credit");
    return true;
  } catch {
    // Some accounts may not expose credit endpoint — try a harmless probe
    try {
      await kieFetch(apiKey, "/api/v1/jobs/recordInfo?taskId=probe");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // Auth failures are clear; 404 task means key was accepted
      if (/not found|task/i.test(msg)) return true;
      throw err;
    }
  }
}
