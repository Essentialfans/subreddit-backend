"use client";

import { DashboardHeader } from "@/components/layout/dashboard-header";
import { JobRow } from "@/components/jobs/job-row";
import { NewJobControls } from "@/components/jobs/new-job-controls";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredJobs } from "@/lib/hooks/use-filtered-jobs";
import { useJobsContext } from "@/lib/hooks/use-jobs";
import { formatCurrency } from "@/lib/utils";
import type { JobStatus } from "@/types";

const STATUS_OPTIONS: Array<{ value: JobStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "running", label: "Running" },
  { value: "awaiting_review", label: "Awaiting review" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

export default function JobsPage() {
  const { jobs, isLoading, error } = useJobsContext();
  const {
    filteredJobs,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
  } = useFilteredJobs(jobs);

  const totalCost = filteredJobs.reduce((sum, job) => sum + job.cost, 0);

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Jobs"
        subtitle={`${jobs.length.toLocaleString()} total generation runs`}
      />

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>All jobs</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Track every video, image, and tool run with status and cost.
            </p>
          </div>
          <NewJobControls />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Search by job ID or type..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="sm:max-w-xs"
            />
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as JobStatus | "all")
              }
            >
              <SelectTrigger className="sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center text-sm text-muted-foreground sm:ml-auto">
              Filtered spend:{" "}
              <span className="ml-1 font-medium text-accent-blue">
                {formatCurrency(totalCost)}
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-accent-red">{error}</p>}

          {isLoading ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {jobs.length === 0
                  ? "No jobs yet. Create one with New Job to start tracking runs and cost."
                  : "No jobs match your filters."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredJobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
