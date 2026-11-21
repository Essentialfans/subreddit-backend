"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  computeActivityData,
  computeDailyBreakdown,
  computeDashboardStats,
} from "@/lib/jobs/aggregations";
import {
  completeStubJob,
  createJob,
  fetchJobs,
  updateJob,
} from "@/lib/jobs/queries";
import { fetchOwnTelegramProfile } from "@/lib/profiles";
import type { Job, PeriodDays } from "@/types";

interface JobsContextValue {
  jobs: Job[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createStubJob: (type: string) => Promise<Job>;
  createBatchStubJobs: (count: number) => Promise<void>;
}

const JobsContext = createContext<JobsContextValue | null>(null);

async function simulateJobRun(job: Job): Promise<void> {
  await updateJob(job.id, { progress: 45 });

  const shouldFail = Math.random() < 0.08;
  if (shouldFail) {
    await updateJob(job.id, {
      status: "failed",
      progress: 100,
      cost: 0,
    });
    return;
  }

  await completeStubJob(job.id, job.type);
}

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const nextJobs = await fetchJobs();
      setJobs(nextJobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetchJobs()
      .then((nextJobs) => {
        if (!active) return;
        setJobs(nextJobs);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load jobs.");
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const createStubJob = useCallback(
    async (type: string) => {
      const profile = await fetchOwnTelegramProfile();
      if (!profile.telegramVerified) {
        throw new Error(
          "Link Telegram in Settings before creating jobs (anti-scam verification)."
        );
      }

      const job = await createJob({ type, status: "running", progress: 0 });
      setJobs((current) => [job, ...current]);

      window.setTimeout(async () => {
        try {
          await simulateJobRun(job);
          await refresh();
        } catch {
          await refresh();
        }
      }, 1500);

      return job;
    },
    [refresh]
  );

  const createBatchStubJobs = useCallback(
    async (count: number) => {
      const types = ["video", "photo", "batch", "ltx", "construct", "upscale"];

      for (let i = 0; i < count; i++) {
        const type = types[i % types.length];
        await createStubJob(type);
      }
    },
    [createStubJob]
  );

  const value = useMemo(
    () => ({
      jobs,
      isLoading,
      error,
      refresh,
      createStubJob,
      createBatchStubJobs,
    }),
    [jobs, isLoading, error, refresh, createStubJob, createBatchStubJobs]
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}

export function useJobsContext() {
  const context = useContext(JobsContext);
  if (!context) {
    throw new Error("useJobsContext must be used within JobsProvider");
  }
  return context;
}

export function useDashboardStats() {
  const { jobs, isLoading, error } = useJobsContext();
  return {
    stats: computeDashboardStats(jobs),
    isLoading,
    error,
  };
}

export function useActivityData(initialPeriod: PeriodDays = 30) {
  const { jobs, isLoading, error } = useJobsContext();
  const [period, setPeriod] = useState<PeriodDays>(initialPeriod);
  const data = useMemo(
    () => computeActivityData(jobs, period),
    [jobs, period]
  );

  return { data, period, setPeriod, isLoading, error };
}

export function useDailyBreakdown() {
  const { jobs, isLoading, error } = useJobsContext();
  return {
    rows: computeDailyBreakdown(jobs),
    isLoading,
    error,
  };
}

export function useRecentJobs() {
  const { jobs, isLoading, error } = useJobsContext();
  return {
    jobs: jobs.slice(0, 6),
    isLoading,
    error,
  };
}
