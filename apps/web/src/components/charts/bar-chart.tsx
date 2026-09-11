/**
 * Bar chart, drawn by hand in SVG on purpose: the project has no charting
 * library installed and this component is not the one that will bring one in.
 * The bars paint with `currentColor`, inherited from a token class, so they
 * respect both themes.
 *
 * It is deliberately domain-free: points in, chart out. Labels arrive already
 * formatted by the caller, which keeps locale and date handling out of here.
 */

export interface BarChartPoint {
  /** Stable identity for the bar (React key). */
  key: string;
  /** Axis label, already formatted for display. */
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarChartPoint[];
  /** Accessible name of the chart as a whole. */
  ariaLabel: string;
  emptyLabel: string;
  /** Takes (label, value) and returns the text a screen reader announces. */
  describePoint: (label: string, value: number) => string;
  className?: string;
}

const HEIGHT = 140;
const GAP = 2;

export function BarChart({
  data,
  ariaLabel,
  emptyLabel,
  describePoint,
  className = 'h-36 w-full text-primary',
}: BarChartProps) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  // A chart where every value is zero still needs a divisor: without the 1 the
  // bar heights would be NaN and the whole figure would vanish.
  const max = Math.max(...data.map((point) => point.value), 1);
  const slot = 100 / data.length;
  const barWidth = Math.max(slot - GAP, 0.5);

  return (
    <figure className="space-y-2">
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        className={className}
      >
        {/* baseline, in a neutral token */}
        <line
          x1="0"
          y1={HEIGHT - 0.5}
          x2="100"
          y2={HEIGHT - 0.5}
          className="text-border"
          stroke="currentColor"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((point, index) => {
          // A zero keeps a one-unit stub: an empty day must still be a day on
          // the axis, not a hole in the chart.
          const barHeight = point.value === 0 ? 1 : (point.value / max) * (HEIGHT - 8);
          return (
            <rect
              key={point.key}
              x={index * slot + GAP / 2}
              y={HEIGHT - barHeight}
              width={barWidth}
              height={barHeight}
              rx="0.6"
              fill="currentColor"
              opacity={point.value === 0 ? 0.25 : 0.85}
            >
              <title>{describePoint(point.label, point.value)}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="flex justify-between font-mono text-[0.65rem] text-muted-foreground">
        <span>{data[0]!.label}</span>
        <span>{data[data.length - 1]!.label}</span>
      </figcaption>
    </figure>
  );
}
