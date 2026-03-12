import { TimeBlock } from "@/types/dayflow";

/**
 * Find the next available time slot given existing blocks.
 * Returns the start hour (decimal, snapped to 15-min increments).
 * 
 * @param currentHour - If provided, never schedule before this hour (for future-only scheduling)
 */
export function findNextAvailableSlot(
  existingBlocks: TimeBlock[],
  durationHours: number,
  preferredTime: string,
  date: string,
  currentHour?: number
): number {
  const ranges: Record<string, [number, number]> = {
    morning: [7, 12],
    afternoon: [12, 17],
    evening: [17, 21],
    any: [8, 20],
  };
  const [rangeStart, rangeEnd] = ranges[preferredTime] || ranges.any;

  // Clamp range start to current time (rounded up to next 15min) if provided
  const now15 = currentHour !== undefined
    ? Math.ceil(currentHour * 4) / 4
    : 0;
  const effectiveStart = Math.max(rangeStart, now15);

  const occupied = existingBlocks
    .filter((b) => b.date === date)
    .map((b) => ({ start: b.startHour, end: b.startHour + b.durationHours }))
    .sort((a, b) => a.start - b.start);

  for (const tryRange of [
    [effectiveStart, rangeEnd],
    [Math.max(7, now15), 22],
  ]) {
    let candidate = tryRange[0];
    while (candidate + durationHours <= tryRange[1]) {
      const candidateEnd = candidate + durationHours;
      const conflict = occupied.some(
        (o) => candidate < o.end && candidateEnd > o.start
      );
      if (!conflict) return Math.round(candidate * 4) / 4;
      const blocker = occupied.find(
        (o) => candidate < o.end && candidateEnd > o.start
      );
      candidate = blocker ? blocker.end : candidate + 0.25;
      candidate = Math.round(candidate * 4) / 4;
    }
  }
  // Fallback: schedule at next available hour from now
  return currentHour !== undefined ? Math.ceil(currentHour * 4) / 4 : 8;
}
