import {
  Play,
  AlertCircle,
  CheckCircle2,
  DollarSign,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { DashboardStats } from "@/types";

interface StatCardsProps {
  stats: DashboardStats;
}

const statConfig = [
  {
    key: "running" as const,
    label: "Running",
    icon: Play,
    iconClass: "text-accent-blue bg-accent-blue/10",
  },
  {
    key: "awaitingReview" as const,
    label: "Awaiting Review",
    icon: AlertCircle,
    iconClass: "text-accent-orange bg-accent-orange/10",
  },
  {
    key: "completed" as const,
    label: "Completed",
    icon: CheckCircle2,
    iconClass: "text-accent-green bg-accent-green/10",
  },
];

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {statConfig.map(({ key, label, icon: Icon, iconClass }) => (
        <Card key={key}>
          <CardContent className="flex items-center gap-4 p-5">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconClass}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {stats[key].toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Spend</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatCurrency(stats.totalSpend)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pipeline {formatCurrency(stats.pipelineSpend)} · Photo Gen{" "}
              {formatCurrency(stats.photoGenSpend)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
