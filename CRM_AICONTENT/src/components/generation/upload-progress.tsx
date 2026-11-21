export function UploadProgressBar({
  pct,
  label = "Uploading…",
}: {
  pct: number;
  label?: string;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="min-w-[140px] flex-1 space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{safe}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}
