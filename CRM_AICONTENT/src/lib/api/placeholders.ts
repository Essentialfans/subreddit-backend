/**
 * API placeholder module — swap mock hooks for these endpoints when backend is ready.
 *
 * Example future implementation:
 *
 * export async function fetchDashboardStats(): Promise<DashboardStats> {
 *   const res = await fetch("/api/dashboard/stats");
 *   if (!res.ok) throw new Error("Failed to fetch dashboard stats");
 *   return res.json();
 * }
 */

import type {
  ActivityPoint,
  DailyBreakdown,
  DashboardStats,
  Job,
  PeriodDays,
} from "@/types";

export const API_ENDPOINTS = {
  jobs: "/api/jobs",
  job: (id: number) => `/api/jobs/${id}`,
  dashboardStats: "/api/dashboard/stats",
  activity: "/api/dashboard/activity",
  dailyBreakdown: "/api/dashboard/daily-breakdown",
  recentJobs: "/api/jobs/recent",
  trends: "/api/content/trends",
  spending: "/api/analytics/spending",
} as const;

export type FetchDashboardStats = () => Promise<DashboardStats>;
export type FetchActivityData = (period: PeriodDays) => Promise<ActivityPoint[]>;
export type FetchDailyBreakdown = () => Promise<DailyBreakdown[]>;
export type FetchRecentJobs = () => Promise<Job[]>;

// Uncomment and implement when API routes are added:
// export const fetchDashboardStats: FetchDashboardStats = async () => { ... };
// export const fetchActivityData: FetchActivityData = async (period) => { ... };
// export const fetchDailyBreakdown: FetchDailyBreakdown = async () => { ... };
// export const fetchRecentJobs: FetchRecentJobs = async () => { ... };
