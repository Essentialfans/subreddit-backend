import { Badge } from "@/components/ui/badge";
import { formatCurrencyShort } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Job, JobStatus } from "@/types";

function statusVariant(status: JobStatus) {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "awaiting_review":
      return "awaiting";
    case "running":
      return "running";
    default:
      return "outline";
  }
}

function statusLabel(status: JobStatus) {
  switch (status) {
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "awaiting_review":
      return "Awaiting Review";
    case "running":
      return "Running";
    default:
      return status;
  }
}

interface JobRowProps {
  job: Job;
}

export function JobRow({ job }: JobRowProps) {
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-muted/30 px-4 py-3">
      <span className="w-16 shrink-0 text-sm font-medium text-muted-foreground">
        #{job.id}
      </span>
      <span className="flex h-7 w-10 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
        {job.typeLabel}
      </span>
      <Badge variant={statusVariant(job.status)}>{statusLabel(job.status)}</Badge>
      <div className="hidden min-w-0 flex-1 sm:block">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              job.status === "failed" ? "bg-accent-red" : "bg-primary"
            )}
            style={{ width: `${job.progress}%` }}
          />
        </div>
      </div>
      <span className="ml-auto shrink-0 text-sm tabular-nums text-muted-foreground">
        {formatCurrencyShort(job.cost)}
      </span>
    </div>
  );
}

export { statusLabel, statusVariant };
