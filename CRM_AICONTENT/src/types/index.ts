export type JobStatus = "running" | "awaiting_review" | "completed" | "failed";

export interface User {
  id: string;
  name: string;
  email: string;
  telegramUsername?: string | null;
  telegramVerified?: boolean;
}

export interface Job {
  id: number;
  type: string;
  typeLabel: string;
  status: JobStatus;
  progress: number;
  cost: number;
  createdAt: string;
}

export interface DashboardStats {
  totalJobs: number;
  running: number;
  awaitingReview: number;
  completed: number;
  totalSpend: number;
  pipelineSpend: number;
  photoGenSpend: number;
}

export interface DailyBreakdown {
  date: string;
  cost: number;
  videos: number;
  sfwPhotos: number;
  nsfwPhotos: number;
  jobs: number;
  failed: number;
}

export interface ActivityPoint {
  date: string;
  videos: number;
  photos: number;
  cost: number;
}

export type PeriodDays = 7 | 30 | 90;
