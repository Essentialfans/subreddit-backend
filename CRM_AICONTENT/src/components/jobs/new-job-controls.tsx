"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JOB_TYPES } from "@/lib/jobs/job-types";
import { useJobsContext } from "@/lib/hooks/use-jobs";

export function NewJobControls() {
  const { createStubJob } = useJobsContext();
  const [type, setType] = useState(JOB_TYPES[0].type);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setIsSubmitting(true);
    setError(null);

    try {
      await createStubJob(type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {JOB_TYPES.map((jobType) => (
            <SelectItem key={jobType.type} value={jobType.type}>
              {jobType.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={handleCreate} disabled={isSubmitting}>
        <Plus className="h-4 w-4" />
        {isSubmitting ? "Creating..." : "New Job"}
      </Button>
      {error && <p className="text-sm text-accent-red">{error}</p>}
    </div>
  );
}
