import { TimeBlock, SchedulingWindow } from "@/types/dayflow";

/**
 * Find the next available time slot given existing blocks.
 * Returns the start hour (decimal, snapped to 15-min increments).
 *
 * @param currentHour - If provided, never schedule before this hour (for future-only scheduling)
 * @param categoryWindow - If provided, constrains scheduling to this window
 */
export function findNextAvailableSlot(
  existingBlocks: TimeBlock[],
  durationHours: number,
  preferredTime: string,
  date: string,
  currentHour?: number,
  categoryWindow?: SchedulingWindow
): number {
  const defaultRanges: Record<string, [number, number]> = {
    morning: [7, 12],
    afternoon: [12, 17],
    evening: [17, 21],
    any: [8, 20],
  };
  let [rangeStart, rangeEnd] = defaultRanges[preferredTime] || defaultRanges.any;

  // Constrain to category scheduling window if provided
  if (categoryWindow) {
    rangeStart = Math.max(rangeStart, categoryWindow.startHour);
    rangeEnd = Math.min(rangeEnd, categoryWindow.endHour);
    // If preferred time falls entirely outside the window, use the window directly
    if (rangeStart >= rangeEnd) {
      rangeStart = categoryWindow.startHour;
      rangeEnd = categoryWindow.endHour;
    }
  }

  // Clamp range start to current time (rounded up to next 15min) if provided
  const now15 = currentHour !== undefined
    ? Math.ceil(currentHour * 4) / 4
    : 0;
  const effectiveStart = Math.max(rangeStart, now15);

  const occupied = existingBlocks
    .filter((b) => b.date === date)
    .map((b) => ({ start: b.startHour, end: b.startHour + b.durationHours }))
    .sort((a, b) => a.start - b.start);

  // Fallback range: use category window if available, else broad range
  const fallbackStart = categoryWindow ? Math.max(categoryWindow.startHour, now15) : Math.max(7, now15);
  const fallbackEnd = categoryWindow ? categoryWindow.endHour : 22;

  for (const tryRange of [
    [effectiveStart, rangeEnd],
    [fallbackStart, fallbackEnd],
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

/**
 * Resolve overlaps after a block is placed at a specific time.
 * Displaced blocks get shifted forward to the next available slot.
 * Fixed blocks are never moved. Returns the full updated block list.
 */
export function resolveOverlaps(
  allBlocks: TimeBlock[],
  movedBlockId: string
): TimeBlock[] {
  const blocks = allBlocks.map((b) => ({ ...b }));
  const moved = blocks.find((b) => b.id === movedBlockId);
  if (!moved) return blocks;

  const date = moved.date;
  const dayBlocks = blocks.filter((b) => b.date === date && b.id !== movedBlockId);
  const otherDateBlocks = blocks.filter((b) => b.date !== date);

  // Sort day blocks: the moved block takes priority, then fixed blocks, then by start time
  const sorted = [moved, ...dayBlocks.sort((a, b) => {
    if (a.isFixed && !b.isFixed) return -1;
    if (!a.isFixed && b.isFixed) return 1;
    return a.startHour - b.startHour;
  })];

  // Build occupied ranges from placed blocks
  const placed: TimeBlock[] = [moved];

  for (const block of sorted) {
    if (block.id === movedBlockId) continue;
    if (block.isFixed) {
      placed.push(block);
      continue;
    }

    // Check if current position conflicts with any placed block
    const hasConflict = placed.some(
      (p) =>
        p.date === block.date &&
        block.startHour < p.startHour + p.durationHours &&
        block.startHour + block.durationHours > p.startHour
    );

    if (hasConflict) {
      // Find next available slot after the block's current time
      const startHour = findNextAvailableSlot(
        placed,
        block.durationHours,
        "any",
        date,
        block.startHour
      );
      block.startHour = startHour;
    }
    placed.push(block);
  }

  return [...otherDateBlocks, ...placed];
}
