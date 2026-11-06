import { NextResponse } from "next/server";
import { getKieTask } from "@/lib/kie/client";
import { loadKieApiKey, requireUserId } from "@/lib/kie/keys";

export const runtime = "nodejs";

function normalizeState(state: string): "pending" | "running" | "success" | "failed" {
  const s = state.toLowerCase();
  if (/(success|succeed|completed|done|finished)/.test(s)) return "success";
  if (/(fail|error|cancel)/.test(s)) return "failed";
  if (/(run|process|generat|queue|wait|pending|creat)/.test(s)) return "running";
  return "pending";
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const taskId = new URL(request.url).searchParams.get("taskId");
    if (!taskId) {
      return NextResponse.json(
        { ok: false, error: "taskId is required" },
        { status: 400 }
      );
    }

    const apiKey = await loadKieApiKey(userId);
    const info = await getKieTask(apiKey, taskId);
    const status = normalizeState(info.state);

    const images = info.resultUrls.filter((u) =>
      /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)
    );
    const videos = info.resultUrls.filter((u) =>
      /\.(mp4|webm|mov)(\?|$)/i.test(u)
    );
    // If extension missing, guess by mode of URLs
    const unknown = info.resultUrls.filter(
      (u) => !images.includes(u) && !videos.includes(u)
    );

    return NextResponse.json({
      ok: true,
      taskId: info.taskId,
      state: info.state,
      status,
      resultUrls: info.resultUrls,
      imageUrls: images.length ? images : unknown,
      videoUrls: videos,
      failMsg: info.failMsg,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Status failed";
    const code = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}
