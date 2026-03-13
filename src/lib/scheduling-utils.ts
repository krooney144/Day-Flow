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

  // Category window is the hard boundary — preferred time is a hint within it
  const hardStart = categoryWindow ? categoryWindow.startHour : 0;
  const hardEnd = categoryWindow ? categoryWindow.endHour : 24;

  const [prefStart, prefEnd] = defaultRanges[preferredTime] || defaultRanges.any;
  // Clamp preferred range to within the category window
  let rangeStart = Math.max(prefStart, hardStart);
  let rangeEnd = Math.min(prefEnd, hardEnd);
  // If preferred time falls entirely outside the window, use the full window
  if (rangeStart >= rangeEnd) {
    rangeStart = hardStart;
    rangeEnd = hardEnd;
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

  // Fallback range: full category window (or broad range if no window)
  const fallbackStart = Math.max(hardStart, now15);
  const fallbackEnd = hardEnd;

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
  // Fallback: schedule at start of category window or 8am
  return Math.max(currentHour !== undefined ? Math.ceil(currentHour * 4) / 4 : hardStart, hardStart);
}

const MAX_OVERLAP = 1;

/**
 * Count how many blocks overlap at a given point in time.
 */
function countOverlapsAt(blocks: TimeBlock[], hour: number, excludeId?: string): number {
  return blocks.filter(
    (b) => b.id !== excludeId && hour >= b.startHour && hour < b.startHour + b.durationHours
  ).length;
}

/**
 * Check if adding a block would exceed the max overlap limit at any point.
 */
function wouldExceedMaxOverlap(placed: TimeBlock[], block: TimeBlock): boolean {
  // Check at block start and every 15-min within the block
  for (let h = block.startHour; h < block.startHour + block.durationHours; h += 0.25) {
    if (countOverlapsAt(placed, h, block.id) >= MAX_OVERLAP) return true;
  }
  return false;
}

/**
 * Resolve overlaps after a block is placed at a specific time.
 * No two blocks may occupy the same time slot (MAX_OVERLAP = 1).
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

    // Only displace if adding this block would exceed max overlap
    if (wouldExceedMaxOverlap(placed, block)) {
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
