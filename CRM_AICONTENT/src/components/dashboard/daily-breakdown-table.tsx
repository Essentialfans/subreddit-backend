import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { DailyBreakdown } from "@/types";

interface DailyBreakdownTableProps {
  rows: DailyBreakdown[];
}

export function DailyBreakdownTable({ rows }: DailyBreakdownTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Videos</TableHead>
              <TableHead>SFW Photos</TableHead>
              <TableHead>NSFW Photos</TableHead>
              <TableHead>Jobs</TableHead>
              <TableHead>Failed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.date}>
                <TableCell className="font-medium">{row.date}</TableCell>
                <TableCell className="text-accent-blue">
                  {formatCurrency(row.cost)}
                </TableCell>
                <TableCell>{row.videos.toLocaleString()}</TableCell>
                <TableCell>{row.sfwPhotos.toLocaleString()}</TableCell>
                <TableCell>{row.nsfwPhotos.toLocaleString()}</TableCell>
                <TableCell>{row.jobs.toLocaleString()}</TableCell>
                <TableCell
                  className={cn(
                    row.failed > 0 ? "font-medium text-accent-red" : "text-muted-foreground"
                  )}
                >
                  {row.failed}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
