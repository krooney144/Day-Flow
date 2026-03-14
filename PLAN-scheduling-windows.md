# Plan: Enforce Category Scheduling Windows + Add Day-of-Week Controls

## Problem

1. **Category windows aren't enforced on AI-generated blocks.** When the AI calls `generate_schedule`, it sends raw `startHour` values. The client only clamps to current time (`clampedStart`) but never validates against the task's category scheduling window. So the AI can place a school task at 7 AM even if the school window is 10–15. The enforcement gaps:
   - `generate_schedule` in `planner-ai.ts:286-288` — `clampedStart` only checks current time, ignores category window
   - `resolveOverlaps()` in `scheduling-utils.ts:141` — displaced blocks can land outside their window (no category window passed)
   - `generate_schedule` overlap resolution in `planner-ai.ts:374` — `findNextAvailableSlot` called without category window

2. **No day-of-week controls.** Users can't say "no school on Friday/Saturday" or "work only Mon–Fri." The scheduling window only has hours, not days.

3. **Redundant global work hours.** `workStartHour`/`workEndHour` in the Planning section duplicates the work category's scheduling window. These should be controlled per-category only, with the work category just being one of the categories.

---

## Changes by File

### 1. `src/types/dayflow.ts` — Add `allowedDays` to SchedulingWindow

```typescript
export interface SchedulingWindow {
  startHour: number;  // 0-23
  endHour: number;    // 1-24
  allowedDays?: number[];  // 0=Sun, 1=Mon, ..., 6=Sat. undefined = all days
}
```

- `allowedDays` is optional — `undefined` means all days allowed (backwards compatible)
- Same convention as `RecurrenceRule.daysOfWeek`

### 2. `src/store/dayflow-store.ts` — Update default preferences

Update `defaultPreferences` to include `allowedDays` for each category:

| Category | Default allowedDays | Rationale |
|---|---|---|
| work | [1,2,3,4,5] (Mon–Fri) | Most people work weekdays |
| school | [1,2,3,4,5] (Mon–Fri) | Classes are weekdays |
| social | [0,1,2,3,4,5,6] (all) | Social happens anytime |
| life-admin | [0,1,2,3,4,5,6] (all) | Chores happen anytime |

Keep `workStartHour`/`workEndHour` on UserPreferences for backwards compatibility (used by end-of-day detection in planner-chat.js and useTaskScheduleSync), but derive them from the work category window instead of the other way around.

### 3. `src/lib/scheduling-utils.ts` — Enforce windows in ALL scheduling paths

**Add `isDayAllowed` helper:**

```typescript
export function isDayAllowed(date: string, window?: SchedulingWindow): boolean
```

Checks if the date's day-of-week is in `window.allowedDays` (returns true if undefined/empty).

**Add `clampToWindow` helper:**

```typescript
export function clampToWindow(
  startHour: number,
  durationHours: number,
  window?: SchedulingWindow
): number
```

If the block's start or end falls outside the category window, clamps it to fit within. Used by `generate_schedule` to validate AI-provided times.

**Update `resolveOverlaps()`:**

Accept an optional `categories` parameter. When displacing a block, look up its `categoryId` → find its scheduling window → pass to `findNextAvailableSlot`. Current code at line 141 calls `findNextAvailableSlot` with no window, so displaced blocks can end up anywhere.

```typescript
export function resolveOverlaps(
  allBlocks: TimeBlock[],
  movedBlockId: string,
  maxOverlap?: number,
  categories?: Category[]  // NEW: pass category list for window enforcement
): TimeBlock[]
```

### 4. `src/lib/planner-ai.ts` — Enforce category windows on AI blocks

This is the main fix for "AI schedules tasks outside designated windows."

**In `generate_schedule` handler (lines 281-349):**

After computing `clampedStart`, also clamp to the block's category window:

```typescript
// Current: only clamps to current time
const clampedStart = targetDate === today
  ? Math.max(ab.startHour, Math.ceil(currentHour * 4) / 4)
  : ab.startHour;

// NEW: also clamp to category scheduling window
const catWindow = store.preferences?.categories?.find(
  (c) => c.id === (ab.categoryId || existing?.categoryId)
)?.schedulingWindow;
const windowedStart = clampToWindow(clampedStart, ab.durationHours, catWindow);
```

Use `windowedStart` instead of `clampedStart` when setting block positions.

**In `generate_schedule` overlap resolution (lines 368-386):**

Pass category window to `findNextAvailableSlot` at line 374. Currently passes `"any"` with no window:

```typescript
// Current
const newStart = findNextAvailableSlot(dayBlocks, block.durationHours, "any", targetDate, block.startHour);

// NEW: look up category window
const catWindow = store.preferences?.categories?.find(c => c.id === block.categoryId)?.schedulingWindow;
const newStart = findNextAvailableSlot(dayBlocks, block.durationHours, "any", targetDate, block.startHour, catWindow);
```

**In `resolveOverlaps` calls throughout:** Pass `store.preferences.categories` so displaced blocks stay in-window.

**Day-of-week enforcement in auto-scheduling:** When picking a target date via `getAutoScheduleDateForHorizon`, skip dates that aren't in the category's `allowedDays`. If a task's category doesn't allow Saturday, don't schedule it on Saturday.

### 5. `src/hooks/useTaskScheduleSync.ts` — Add day-of-week check

Already passes `category?.schedulingWindow` to `findNextAvailableSlot`. Need to add: when picking a target date, skip dates where `!isDayAllowed(date, category?.schedulingWindow)`.

### 6. `src/pages/SettingsPage.tsx` — UI changes

**Remove "Work starts" / "Work ends" from Planning section.** The work category's scheduling window controls those hours directly. Keep "Lunch at", "Dinner at", "Default task duration" in Planning.

**Un-disable the work category window.** Remove the `isWorkCategory` disabled check and the "Synced with work hours above" note. Users control work hours directly in the category section just like every other category.

**Sync `workStartHour`/`workEndHour` from work category window.** When the work category window changes, update the global `workStartHour`/`workEndHour` to match (for backwards compat with AI prompt and end-of-day detection).

**Add day-of-week toggles per category.** In each expanded category accordion, below the hour steppers, add a row of 7 day buttons:

```
  S   M   T   W   T   F   S
 [ ] [●] [●] [●] [●] [●] [ ]   ← work (Mon–Fri default)
```

- Tappable circles, filled = active day
- Use category color for active state
- All days selected by default for social/life-admin
- Mon–Fri selected by default for work/school

### 7. `api/planner-chat.js` — Update AI prompt with day info

Update the category windows section to include allowed days:

```
- work: 9:00 – 17:00 (Mon–Fri only)
- school: 10:00 – 22:00 (Mon–Fri only)
- social: 10:00 – 22:00 (all days)
- life-admin: 10:00 – 21:00 (all days)
```

Add rule: "When placing a task on a specific date, check that the date's day-of-week is in the category's allowed days. If not, move it to the nearest allowed day."

Also update `workStartHour`/`workEndHour` references to derive from the work category window, keeping the prompt consistent.

### 8. `src/lib/recurrence-utils.ts` — Day check for recurring instances

If a recurring instance falls on a day not in its category's `allowedDays`, skip that date.

---

## Implementation Order

1. **Types** — Add `allowedDays` to `SchedulingWindow`
2. **scheduling-utils.ts** — Add `isDayAllowed`, `clampToWindow`, update `resolveOverlaps` signature
3. **planner-ai.ts** — Clamp AI block times to category windows, pass windows through overlap resolution, add day-of-week to auto-scheduling
4. **useTaskScheduleSync.ts** — Add day-of-week check when picking target dates
5. **Store** — Update default category `allowedDays`, sync `workStartHour`/`workEndHour` from work category
6. **SettingsPage.tsx** — Remove global work hours, un-disable work category, add day toggles
7. **planner-chat.js** — Update AI prompt with day + window info
8. **recurrence-utils.ts** — Add day-of-week check
