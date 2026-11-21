import { createClient } from "@/lib/supabase/client";
import { getJobTypeDefinition } from "@/lib/jobs/job-types";
import { mapDbJob, mapDbJobs, type DbJob } from "@/lib/jobs/mappers";
import type { Job, JobStatus } from "@/types";

export interface CreateJobInput {
  type: string;
  status?: JobStatus;
  progress?: number;
  cost?: number;
}

export async function fetchJobs(): Promise<Job[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return mapDbJobs(data as DbJob[]);
}

export async function fetchRecentJobs(limit = 6): Promise<Job[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return mapDbJobs(data as DbJob[]);
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const supabase = createClient();
  const definition = getJobTypeDefinition(input.type);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to create a job.");
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      type: definition.type,
      type_label: definition.label,
      status: input.status ?? "running",
      progress: input.progress ?? 0,
      cost: input.cost ?? 0,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapDbJob(data as DbJob);
}

export async function updateJob(
  id: number,
  updates: Partial<{
    status: JobStatus;
    progress: number;
    cost: number;
  }>
): Promise<Job> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapDbJob(data as DbJob);
}

export async function completeStubJob(id: number, type: string): Promise<Job> {
  const definition = getJobTypeDefinition(type);

  return updateJob(id, {
    status: "completed",
    progress: 100,
    cost: definition.defaultCost,
  });
}

export async function failStubJob(id: number): Promise<Job> {
  return updateJob(id, {
    status: "failed",
    progress: 100,
    cost: 0,
  });
}
