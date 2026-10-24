"use client";

import { useMemo, useState } from "react";
import type { Job, JobStatus } from "@/types";

export function useFilteredJobs(jobs: Job[]) {
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [search, setSearch] = useState("");

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesStatus =
        statusFilter === "all" || job.status === statusFilter;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        String(job.id).includes(query) ||
        job.typeLabel.toLowerCase().includes(query) ||
        job.type.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [jobs, search, statusFilter]);

  return {
    filteredJobs,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
  };
}
