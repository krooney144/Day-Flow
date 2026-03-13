# Plan: Enforce Category Scheduling Windows + Add Day-of-Week Controls

## Problem

1. **Category windows aren't enforced consistently.** Tasks get scheduled outside their category's time window because several scheduling paths don't pass the category window to `findNextAvailableSlot`:
   - `resolveOverlaps()` in `scheduling-utils.ts:141` — displaced blocks can land outside their window
   - `generate_schedule` overlap resolution in `planner-ai.ts:375` — same issue
   - The AI (GPT-4o) is told about windows in the prompt but enforcement is client-side only

2. **No day-of-week controls.** Users can't say "no school on Friday/Saturday" or "work only Mon-Fri." The scheduling window only has hours, not days.

3. **Redundant global work hours.** `workStartHour`/`workEndHour` in UserPreferences duplicates the work category's scheduling window. Should be per-category only.

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
- This is the same convention as `RecurrenceRule.daysOfWeek`

### 2. `src/store/dayflow-store.ts` — Update default preferences

Update `defaultPreferences` to include `allowedDays` for each category:

| Category | Default allowedDays | Rationale |
|---|---|---|
| work | [1,2,3,4,5] (Mon-Fri) | Most people work weekdays |
| school | [1,2,3,4,5] (Mon-Fri) | Classes are weekdays |
| social | [0,1,2,3,4,5,6] (all) | Social happens anytime |
| life-admin | [0,1,2,3,4,5,6] (all) | Chores happen anytime |

Keep `workStartHour`/`workEndHour` on UserPreferences for now (used by other code like end-of-day detection, the AI prompt's "work hours" context), but make the settings UI control them through the category window.

### 3. `src/lib/scheduling-utils.ts` — Enforce windows in ALL scheduling paths

**`findNextAvailableSlot()`** — already accepts `categoryWindow`. No change needed for hours. But need to export a helper:

```typescript
export function isDayAllowed(date: string, window?: SchedulingWindow): boolean
```

This checks if the date's day-of-week is in `window.allowedDays` (or returns true if undefined/empty).

**`resolveOverlaps()`** — Currently calls `findNextAvailableSlot` at line 141 WITHOUT a category window. This is the main enforcement gap. Need to:
- Accept a `categories` parameter (the full category list)
- Look up each displaced block's categoryId → find its scheduling window → pass to `findNextAvailableSlot`

### 4. `src/lib/planner-ai.ts` — Pass category windows through all paths

**`generate_schedule` overlap resolution (lines 362-387):**
Currently calls `findNextAvailableSlot` at line 375 with `"any"` preferred time and NO category window. Need to look up the block's categoryId and pass its window.

**`resolveOverlaps` calls throughout:** Now that `resolveOverlaps` accepts categories, pass `store.preferences.categories` from executeToolCalls.

### 5. `src/hooks/useTaskScheduleSync.ts` — Already passes category window (line 108)

This path already looks up `category?.schedulingWindow` and passes it. Need to add day-of-week check: skip scheduling on disallowed days.

### 6. `src/pages/SettingsPage.tsx` — UI changes

**Remove "Work starts" / "Work ends" from Planning section.** Replace with:
- Keep "Lunch at", "Dinner at", "Default task duration" in Planning
- Move hour controls entirely to Category Schedule Windows section

**Add day-of-week toggles per category:**
- In each expanded category accordion, below the hour steppers, add a row of 7 day buttons: S M T W T F S
- Active days highlighted, tapped to toggle
- All days selected by default for social/life-admin
- Mon-Fri selected by default for work/school

**Un-disable the work category window.** Remove the "Synced with work hours above" note and let users control work hours directly in the category section like all others.

### 7. `api/planner-chat.js` — Update AI prompt with day info

Update the category windows section of the system prompt to include allowed days:

```
- work: 9:00 – 17:00 (Mon-Fri only)
- school: 10:00 – 22:00 (Mon-Fri only)
- social: 10:00 – 22:00 (all days)
- life-admin: 10:00 – 21:00 (all days)
```

Also update the scheduling rules to tell the AI: "When placing a task on a specific date, check that the date's day-of-week is in the category's allowed days. If not, move it to the nearest allowed day."

### 8. `src/lib/recurrence-utils.ts` — Already passes category window

Line 78 already passes `catWindow`. Need to add day check: if a recurring instance falls on a disallowed day, skip that date.

---

## Implementation Order

1. **Types** — Add `allowedDays` to `SchedulingWindow`
2. **Store** — Update defaults, sync `workStartHour`/`workEndHour` from work category
3. **scheduling-utils.ts** — Add `isDayAllowed`, update `resolveOverlaps` signature to accept categories
4. **planner-ai.ts** — Pass category windows through generate_schedule overlap resolution and resolveOverlaps calls
5. **useTaskScheduleSync.ts** — Add day-of-week check
6. **recurrence-utils.ts** — Add day-of-week check
7. **SettingsPage.tsx** — Remove global work hours, add day toggles, un-disable work category
8. **planner-chat.js** — Update AI prompt with day info
9. **Tests** — Update existing tests, add new ones for day-of-week enforcement
