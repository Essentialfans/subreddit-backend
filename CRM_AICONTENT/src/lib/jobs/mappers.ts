import type { Job, JobStatus } from "@/types";
import { getJobTypeDefinition } from "@/lib/jobs/job-types";

export interface DbJob {
  id: number;
  user_id: string;
  type: string;
  type_label: string;
  status: JobStatus;
  progress: number;
  cost: string | number;
  created_at: string;
}

export function mapDbJob(row: DbJob): Job {
  const definition = getJobTypeDefinition(row.type);

  return {
    id: row.id,
    type: row.type,
    typeLabel: row.type_label || definition.label,
    status: row.status,
    progress: row.progress,
    cost: Number(row.cost),
    createdAt: row.created_at,
  };
}

export function mapDbJobs(rows: DbJob[] | null): Job[] {
  if (!rows) return [];
  return rows.map(mapDbJob);
}
