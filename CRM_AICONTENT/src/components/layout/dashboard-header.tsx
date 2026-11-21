"use client";

import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NewJobControls } from "@/components/jobs/new-job-controls";
import { useJobsContext } from "@/lib/hooks/use-jobs";
import type { PeriodDays } from "@/types";
import { useState } from "react";

interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
  period?: PeriodDays;
  onPeriodChange?: (period: PeriodDays) => void;
  showActions?: boolean;
}

export function DashboardHeader({
  title,
  subtitle,
  period = 30,
  onPeriodChange,
  showActions = false,
}: DashboardHeaderProps) {
  const { createBatchStubJobs } = useJobsContext();
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  async function handleBatch() {
    setIsBatchRunning(true);
    try {
      await createBatchStubJobs(3);
    } finally {
      setIsBatchRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {showActions && (
          <>
            {onPeriodChange && (
              <Select
                value={String(period)}
                onValueChange={(value) =>
                  onPeriodChange(Number(value) as PeriodDays)
                }
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            )}
            <NewJobControls />
            <Button
              variant="secondary"
              onClick={handleBatch}
              disabled={isBatchRunning}
            >
              <Layers className="h-4 w-4" />
              {isBatchRunning ? "Running..." : "Batch"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
