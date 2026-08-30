import { getJobCategory } from "@/lib/jobs/job-types";
import type {
  ActivityPoint,
  DailyBreakdown,
  DashboardStats,
  Job,
  PeriodDays,
} from "@/types";

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function emptyDailyRow(date: string): DailyBreakdown {
  return {
    date,
    cost: 0,
    videos: 0,
    sfwPhotos: 0,
    nsfwPhotos: 0,
    jobs: 0,
    failed: 0,
  };
}

export function computeDashboardStats(jobs: Job[]): DashboardStats {
  let pipelineSpend = 0;
  let photoGenSpend = 0;

  for (const job of jobs) {
    if (getJobCategory(job.type) === "photo") {
      photoGenSpend += job.cost;
    } else {
      pipelineSpend += job.cost;
    }
  }

  return {
    totalJobs: jobs.length,
    running: jobs.filter((job) => job.status === "running").length,
    awaitingReview: jobs.filter((job) => job.status === "awaiting_review")
      .length,
    completed: jobs.filter((job) => job.status === "completed").length,
    totalSpend: pipelineSpend + photoGenSpend,
    pipelineSpend,
    photoGenSpend,
  };
}

export function computeActivityData(
  jobs: Job[],
  period: PeriodDays
): ActivityPoint[] {
  const end = new Date();
  const points: ActivityPoint[] = [];

  for (let i = period - 1; i >= 0; i--) {
    const date = new Date(end);
    date.setDate(end.getDate() - i);
    const key = toDateKey(date.toISOString());
    points.push({ date: key, videos: 0, photos: 0, cost: 0 });
  }

  const pointMap = new Map(points.map((point) => [point.date, point]));
  const cutoff = points[0]?.date;

  for (const job of jobs) {
    const key = toDateKey(job.createdAt);
    if (!cutoff || key < cutoff) continue;

    const point = pointMap.get(key);
    if (!point) continue;

    if (getJobCategory(job.type) === "photo") {
      point.photos += 1;
    } else {
      point.videos += 1;
    }
    point.cost += job.cost;
  }

  return points.map((point) => ({
    ...point,
    cost: Math.round(point.cost * 1000) / 1000,
  }));
}

export function computeDailyBreakdown(jobs: Job[], days = 8): DailyBreakdown[] {
  const rows: DailyBreakdown[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    rows.push(emptyDailyRow(toDateKey(date.toISOString())));
  }

  const rowMap = new Map(rows.map((row) => [row.date, row]));

  for (const job of jobs) {
    const row = rowMap.get(toDateKey(job.createdAt));
    if (!row) continue;

    row.jobs += 1;
    row.cost += job.cost;

    if (job.status === "failed") {
      row.failed += 1;
    }

    if (getJobCategory(job.type) === "photo") {
      row.sfwPhotos += 1;
    } else {
      row.videos += 1;
    }
  }

  return rows.map((row) => ({
    ...row,
    cost: Math.round(row.cost * 1000) / 1000,
  }));
}
