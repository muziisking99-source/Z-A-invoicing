import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

type SeriesPoint = {
  label: string;
  value: number;
};

const ROSE = "#E11D48";
const ROSE_SOFT = "#FFE4E6";
const GRID = "#E4E4E7";

export function LineAreaChart({
  points,
  height = 220,
  emptyLabel = "No sales in this range",
}: {
  points: SeriesPoint[];
  height?: number;
  emptyLabel?: string;
}) {
  const width = 640;
  const padX = 12;
  const padTop = 16;
  const padBottom = 28;
  const chartH = height - padTop - padBottom;
  const chartW = width - padX * 2;
  const max = Math.max(...points.map((p) => p.value), 0);
  const hasData = points.some((p) => p.value > 0);

  if (!hasData) {
    return (
      <div
        className="grid place-items-center rounded-lg border border-dashed border-line bg-secondary/40 text-sm text-soft"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? padX + chartW / 2
        : padX + (i / (points.length - 1)) * chartW;
    const y = padTop + chartH - (max > 0 ? (p.value / max) * chartH : 0);
    return { x, y, ...p };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const area = `${line} L${last.x},${padTop + chartH} L${first.x},${padTop + chartH} Z`;

  const ticks = [0, 0.5, 1].map((t) => ({
    y: padTop + chartH - t * chartH,
    label: money(max * t),
  }));

  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Revenue over time"
    >
      {ticks.map((tick) => (
        <g key={tick.y}>
          <line
            x1={padX}
            x2={width - padX}
            y1={tick.y}
            y2={tick.y}
            stroke={GRID}
            strokeWidth="1"
          />
          <text
            x={width - padX}
            y={tick.y - 4}
            textAnchor="end"
            className="fill-soft"
            style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
          >
            {tick.label}
          </text>
        </g>
      ))}
      <path d={area} fill={ROSE_SOFT} opacity="0.9" />
      <path d={line} fill="none" stroke={ROSE} strokeWidth="2.5" strokeLinejoin="round" />
      {coords.map((c, i) =>
        i % labelEvery === 0 || i === coords.length - 1 ? (
          <text
            key={c.label + i}
            x={c.x}
            y={height - 8}
            textAnchor="middle"
            className="fill-soft"
            style={{ fontSize: 10, fontFamily: "Outfit, sans-serif" }}
          >
            {c.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function HorizontalBarChart({
  points,
  emptyLabel = "No product sales yet",
}: {
  points: SeriesPoint[];
  emptyLabel?: string;
}) {
  const max = Math.max(...points.map((p) => p.value), 0);

  if (!points.length || max <= 0) {
    return (
      <div className="grid h-48 place-items-center rounded-lg border border-dashed border-line bg-secondary/40 text-sm text-soft">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {points.map((point, index) => {
        const pct = max > 0 ? (point.value / max) * 100 : 0;
        return (
          <li key={point.label + index}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-ink sm:text-base">
                {point.label}
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-soft">
                {Number.isInteger(point.value)
                  ? point.value.toLocaleString("en-ZA")
                  : money(point.value)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full bg-primary transition-[width] duration-300")}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DualMetricBars({
  rows,
}: {
  rows: { label: string; revenue: number; profit: number }[];
}) {
  const max = Math.max(...rows.flatMap((r) => [r.revenue, r.profit]), 0);

  if (!rows.length || max <= 0) {
    return (
      <div className="grid h-48 place-items-center rounded-lg border border-dashed border-line bg-secondary/40 text-sm text-soft">
        No product profit data yet
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.label}>
          <p className="mb-1.5 truncate text-sm font-medium text-ink sm:text-base">{row.label}</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-soft">Sales</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(row.revenue / max) * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-soft">
                {money(row.revenue)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-soft">Profit</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent-foreground"
                  style={{
                    width: `${(Math.max(row.profit, 0) / max) * 100}%`,
                    backgroundColor: row.profit >= 0 ? "#BE123C" : "#B91C1C",
                  }}
                />
              </div>
              <span
                className={cn(
                  "w-24 shrink-0 text-right font-mono text-xs tabular-nums",
                  row.profit >= 0 ? "text-accent-ink" : "text-destructive",
                )}
              >
                {money(row.profit)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
