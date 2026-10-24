import type {
  ActivityPoint,
  DailyBreakdown,
  DashboardStats,
  Job,
  PeriodDays,
} from "@/types";

export const dashboardStats: DashboardStats = {
  totalJobs: 17125,
  running: 0,
  awaitingReview: 3,
  completed: 14549,
  totalSpend: 1597.483,
  pipelineSpend: 1384.971,
  photoGenSpend: 212.733,
};

export const dailyBreakdown: DailyBreakdown[] = [
  {
    date: "2026-08-17",
    cost: 42.156,
    videos: 312,
    sfwPhotos: 89,
    nsfwPhotos: 45,
    jobs: 446,
    failed: 2,
  },
  {
    date: "2026-08-16",
    cost: 38.942,
    videos: 287,
    sfwPhotos: 76,
    nsfwPhotos: 52,
    jobs: 415,
    failed: 0,
  },
  {
    date: "2026-08-15",
    cost: 51.203,
    videos: 398,
    sfwPhotos: 102,
    nsfwPhotos: 61,
    jobs: 561,
    failed: 5,
  },
  {
    date: "2026-08-14",
    cost: 45.891,
    videos: 341,
    sfwPhotos: 94,
    nsfwPhotos: 48,
    jobs: 483,
    failed: 1,
  },
  {
    date: "2026-08-13",
    cost: 33.674,
    videos: 256,
    sfwPhotos: 68,
    nsfwPhotos: 39,
    jobs: 363,
    failed: 0,
  },
  {
    date: "2026-08-12",
    cost: 47.528,
    videos: 365,
    sfwPhotos: 88,
    nsfwPhotos: 55,
    jobs: 508,
    failed: 3,
  },
  {
    date: "2026-08-11",
    cost: 29.341,
    videos: 218,
    sfwPhotos: 62,
    nsfwPhotos: 31,
    jobs: 311,
    failed: 0,
  },
  {
    date: "2026-08-10",
    cost: 36.782,
    videos: 279,
    sfwPhotos: 71,
    nsfwPhotos: 44,
    jobs: 394,
    failed: 2,
  },
];

function generateActivityData(days: PeriodDays): ActivityPoint[] {
  const points: ActivityPoint[] = [];
  const baseDate = new Date("2026-08-17");

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() - i);
    const dayOffset = days - i;
    points.push({
      date: date.toISOString().split("T")[0],
      videos: Math.round(150 + Math.sin(dayOffset * 0.4) * 80 + dayOffset * 3),
      photos: Math.round(80 + Math.cos(dayOffset * 0.35) * 40 + dayOffset * 1.5),
      cost: Math.round((20 + Math.sin(dayOffset * 0.5) * 15) * 100) / 100,
    });
  }

  return points;
}

export function getActivityData(days: PeriodDays): ActivityPoint[] {
  return generateActivityData(days);
}

export const recentJobs: Job[] = [
  {
    id: 17880,
    type: "video",
    typeLabel: "VID",
    status: "failed",
    progress: 100,
    cost: 0.042,
    createdAt: "2026-08-17T14:32:00Z",
  },
  {
    id: 17879,
    type: "photo",
    typeLabel: "IMG",
    status: "completed",
    progress: 100,
    cost: 0.018,
    createdAt: "2026-08-17T14:28:00Z",
  },
  {
    id: 17878,
    type: "video",
    typeLabel: "VID",
    status: "completed",
    progress: 100,
    cost: 0.056,
    createdAt: "2026-08-17T14:15:00Z",
  },
  {
    id: 17877,
    type: "batch",
    typeLabel: "BAT",
    status: "completed",
    progress: 100,
    cost: 0.234,
    createdAt: "2026-08-17T13:58:00Z",
  },
  {
    id: 17876,
    type: "video",
    typeLabel: "VID",
    status: "failed",
    progress: 100,
    cost: 0.031,
    createdAt: "2026-08-17T13:42:00Z",
  },
  {
    id: 17875,
    type: "photo",
    typeLabel: "IMG",
    status: "completed",
    progress: 100,
    cost: 0.012,
    createdAt: "2026-08-17T13:30:00Z",
  },
];
