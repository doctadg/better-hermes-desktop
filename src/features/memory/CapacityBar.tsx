/**
 * CapacityBar — thin progress bar showing char usage vs a limit.
 *
 * Color thresholds:
 *   < 70%  → emerald (safe)
 *   70-90% → amber  (warning)
 *   > 90%  → rose   (danger)
 *
 * Above the bar: small "1,820 / 2,200 chars" text right-aligned in zinc-500,
 * with an optional left-aligned label.
 */

interface CapacityBarProps {
  used: number;
  limit: number;
  label?: string;
}

export function CapacityBar({ used, limit, label }: CapacityBarProps) {
  const safeLimit = limit > 0 ? limit : 1;
  const pct = Math.min(100, Math.max(0, (used / safeLimit) * 100));

  // Tailwind classes — keep static so JIT picks them up at build time.
  const fillClass =
    pct > 90
      ? 'bg-rose-500'
      : pct > 70
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1 text-[11px] text-zinc-500">
        <span className="truncate">{label ?? ''}</span>
        <span className="tabular-nums shrink-0 ml-2">
          {used.toLocaleString()} / {limit.toLocaleString()} chars
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
