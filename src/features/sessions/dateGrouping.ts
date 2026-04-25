/**
 * Hermes Desktop — Sessions feature: pure date grouping helper.
 *
 * Groups sessions into Today / Yesterday / This Week / Earlier by their
 * `started_at` (epoch milliseconds). Falsy timestamps land in `earlier`.
 *
 * The bucket boundaries are inclusive on the lower end and use local
 * calendar time:
 *   - today      → same calendar date as `now`
 *   - yesterday  → calendar date == now - 1 day
 *   - thisWeek   → within the last 7 days but not today/yesterday
 *   - earlier    → everything else, including missing/invalid timestamps
 */
export interface SessionLike {
  id: string;
  started_at: number | null | undefined;
}

export interface GroupedSessions<T extends SessionLike> {
  today: T[];
  yesterday: T[];
  thisWeek: T[];
  earlier: T[];
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function groupByDate<T extends SessionLike>(
  sessions: readonly T[],
  now: Date = new Date(),
): GroupedSessions<T> {
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const result: GroupedSessions<T> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  };

  for (const s of sessions) {
    const ts = s.started_at;
    if (!ts || !Number.isFinite(ts)) {
      result.earlier.push(s);
      continue;
    }
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) {
      result.earlier.push(s);
      continue;
    }
    if (d >= todayStart) {
      result.today.push(s);
    } else if (d >= yesterdayStart) {
      result.yesterday.push(s);
    } else if (d >= weekStart) {
      result.thisWeek.push(s);
    } else {
      result.earlier.push(s);
    }
  }

  // Sort each bucket descending (newest first) so the UI doesn't have to.
  const desc = (a: T, b: T): number => (b.started_at ?? 0) - (a.started_at ?? 0);
  result.today.sort(desc);
  result.yesterday.sort(desc);
  result.thisWeek.sort(desc);
  result.earlier.sort(desc);

  return result;
}
