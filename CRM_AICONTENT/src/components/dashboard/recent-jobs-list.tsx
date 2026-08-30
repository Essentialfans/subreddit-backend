import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobRow } from "@/components/jobs/job-row";
import type { Job } from "@/types";

interface RecentJobsListProps {
  jobs: Job[];
  isLoading?: boolean;
}

export function RecentJobsList({ jobs, isLoading }: RecentJobsListProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent Jobs</CardTitle>
        <Link
          href="/jobs"
          className="text-sm font-medium text-primary hover:text-primary/80"
        >
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading jobs...</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No jobs yet. Click New Job to create your first generation run.
          </p>
        ) : (
          jobs.map((job) => <JobRow key={job.id} job={job} />)
        )}
      </CardContent>
    </Card>
  );
}
