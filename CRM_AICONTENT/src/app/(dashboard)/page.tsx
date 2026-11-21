"use client";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { StatCards } from "@/components/dashboard/stat-cards";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { DailyBreakdownTable } from "@/components/dashboard/daily-breakdown-table";
import { RecentJobsList } from "@/components/dashboard/recent-jobs-list";
import {
  useActivityData,
  useDailyBreakdown,
  useDashboardStats,
  useRecentJobs,
} from "@/lib/hooks/use-jobs";

export default function DashboardPage() {
  const { stats, isLoading: statsLoading } = useDashboardStats();
  const { data, period, setPeriod, isLoading: activityLoading } =
    useActivityData(30);
  const { rows, isLoading: breakdownLoading } = useDailyBreakdown();
  const { jobs, isLoading: jobsLoading } = useRecentJobs();

  const isLoading =
    statsLoading || activityLoading || breakdownLoading || jobsLoading;

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Dashboard"
        subtitle={`${stats.totalJobs.toLocaleString()} total jobs`}
        period={period}
        onPeriodChange={setPeriod}
        showActions
      />

      {isLoading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          <StatCards stats={stats} />
          <ActivityChart data={data} period={period} />
          <DailyBreakdownTable rows={rows} />
          <RecentJobsList jobs={jobs} />
        </>
      )}
    </div>
  );
}
