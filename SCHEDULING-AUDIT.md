# Scheduling System Audit Report

## Executive Summary

The Day-Flow scheduling system has **22 distinct paths** that can modify task/block times. Of these:
- **4 are properly protected** against overlaps
- **8 have partial/broken protection** (MAX_OVERLAP=3 allows up to 3 blocks to stack)
- **10 have NO overlap protection at all**

The root cause is architectural: **there is no single centralized validation gate** that prevents overlaps before they enter the schedule. Instead, overlap prevention is scattered across multiple functions, some of which use it and many of which don't.

---

## Part 1: Complete Map of Every Scheduling Trigger

### A. What Happens When the App Opens

When a user opens Day-Flow, **5 separate scheduling systems run automatically**:

| # | System | File | What it does | Overlap-safe? |
|---|--------|------|-------------|---------------|
| 1 | **Cloud sync load** | `dayflow-store.ts:149-207` | Loads tasks + blocks from Supabase, replaces local state | NO |
| 2 | **30-day cleanup** | `dayflow-store.ts:174-186` | Removes old completed/dropped tasks + orphaned blocks | N/A |
| 3 | **Recurring generation** | `dayflow-store.ts:188-206` | Generates recurring task instances for next 14 days | YES (uses `findNextAvailableSlot`) |
| 4 | **useTaskScheduleSync** | `useTaskScheduleSync.ts:11-96` | Creates blocks for orphaned active tasks | YES (uses `findNextAvailableSlot`) |
| 5 | **useMealBlocks** | `useMealBlocks.ts:10-76` | Creates lunch + dinner blocks for today/tomorrow | NO (fixed times, no conflict check) |

Additionally, when the user **switches back to the tab** (e.g., phone lock/unlock):
| 6 | **Visibility change sync** | `dayflow-store.ts:279-300` | Re-fetches ALL data from Supabase, replaces local blocks | NO |

And when **another device makes changes**:
| 7 | **Real-time subscriptions** | `dayflow-store.ts:210-270` | Inserts/updates individual blocks from Supabase | NO |

**Key problem**: Systems 1, 6, and 7 can overwrite locally-resolved overlaps with unresolved cloud data. The 1-second debounce on cloud saves means resolved blocks may not have been saved yet when cloud data replaces them.

### B. RolloverModal (Shown on first open of each day)

The RolloverModal (`RolloverModal.tsx:6-135`) appears when:
- `hasSeenRollover === false` AND `lastOpenDate !== today` AND there are tasks with `rolloverCount > 0` or blocks on past dates

| Button | Action | File:Line | What happens | Overlap-safe? |
|--------|--------|-----------|-------------|---------------|
| **Done** | `updateTask(id, { status: "completed" })` | Line 24 | Marks task done, blocks remain | N/A |
| **Keep** | `updateTask(id, { rolloverCount: 0 })` + `moveBlockToDate(b.id, today)` per past block | Lines 28-33 | Resets rollover, moves all past blocks to today | PARTIAL (MAX_OVERLAP=3) |
| **Defer** | `deferTask(taskId)` + `moveBlockToDate(b.id, today)` per past block | Lines 36-42 | Increments rollover, then moves past blocks to today | BUG (see below) |
| **Drop** | `updateTask(id, { status: "dropped" })` | Line 45 | Marks task dropped, blocks remain | N/A |

**BUG in "Defer"**: `deferTask()` moves the block to TOMORROW (store line 388-389). Then the for-loop tries to move blocks with `b.date < today` to TODAY. But `deferTask` already changed the date to tomorrow, so the for-loop's check `b.date < today` may or may not find the block depending on React state batching. This creates a race condition where the block could end up on either today or tomorrow, potentially overlapping.

### C. Schedule Page Interactions

| Button/Action | File:Line | What happens | Overlap-safe? |
|---------------|-----------|-------------|---------------|
| **Drag block** (grip handle) | `SchedulePage.tsx:296-347` | `updateTimeBlock(id, { startHour })` then `displaceBlock(id)` | PARTIAL (two separate setState calls + MAX_OVERLAP=3) |
| **Move to Tomorrow** (arrow button) | `SchedulePage.tsx:426-430` | `moveBlockToDate(id, tomorrowStr)` | PARTIAL (MAX_OVERLAP=3) |
| **Complete checkbox** | `SchedulePage.tsx:422` | `toggleTaskComplete(taskId)` | N/A (no time change) |
| **Click block → Edit** | `SchedulePage.tsx:431` | Opens TaskDetailSheet or BlockEditSheet | N/A (modal) |

### D. TaskDetailSheet (Editing a task's scheduled time)

| Button/Action | File:Line | What happens | Overlap-safe? |
|---------------|-----------|-------------|---------------|
| **Time +/- buttons** | `TaskDetailSheet.tsx:443-446` → line 185 | `updateTimeBlock(id, { startHour })` | NO |
| **Duration chips/buttons** | `TaskDetailSheet.tsx:313-319` | `updateTimeBlock(id, { durationHours })` | NO |
| **"Prev day" button** | `TaskDetailSheet.tsx:496-500` | `moveBlockToDate(id, newDate)` | PARTIAL (MAX_OVERLAP=3) |
| **"Next day" button** | `TaskDetailSheet.tsx:501-506` | `moveBlockToDate(id, newDate)` | PARTIAL (MAX_OVERLAP=3) |
| **"Today" button** | `TaskDetailSheet.tsx:489-494` | `moveBlockToDate(id, todayStr)` | PARTIAL (MAX_OVERLAP=3) |
| **Calendar date picker** | `TaskDetailSheet.tsx:518-520` | `moveBlockToDate(id, newDate)` | PARTIAL (MAX_OVERLAP=3) |
| **Drop task** | `TaskDetailSheet.tsx:108-111` | `dropTask(id)` — removes blocks | N/A |

### E. BlockEditSheet (Editing a standalone block)

| Button/Action | File:Line | What happens | Overlap-safe? |
|---------------|-----------|-------------|---------------|
| **Save** (date changed) | `BlockEditSheet.tsx:49-50` | `moveBlockToDate(id, newDate)` then `updateTimeBlock(id, {...})` | BUG (non-atomic: resolve then override) |
| **Save** (no date change) | `BlockEditSheet.tsx:52-57` | `updateTimeBlock(id, { title, startHour, durationHours, isFixed })` | NO |
| **"Today" button** | `BlockEditSheet.tsx:133-138` | Sets local `date` state (saved on Save) | N/A |
| **"Prev" / "Next" buttons** | `BlockEditSheet.tsx:140-150` | Calls `moveByDays()` → sets local `date` state | N/A |
| **Calendar picker** | `BlockEditSheet.tsx:161-165` | Sets local `date` state | N/A |
| **Time +/- buttons** | `BlockEditSheet.tsx:66-69` | Sets local `startHour` state (saved on Save) | N/A |
| **Duration chips/+/-** | `BlockEditSheet.tsx:71-74` | Sets local `durationHours` state (saved on Save) | N/A |
| **Delete** | `BlockEditSheet.tsx:61-63` | `removeTimeBlock(id)` | N/A |

**BUG in BlockEditSheet Save**: When both date AND time are changed:
1. `moveBlockToDate()` resolves overlaps on the new date for the OLD startHour
2. `updateTimeBlock()` then sets the NEW startHour WITHOUT re-resolving overlaps
3. The overlap resolution from step 1 is invalidated

### F. QuickAddTask

| Action | File:Line | What happens | Overlap-safe? |
|--------|-----------|-------------|---------------|
| **Add task** | `QuickAddTask.tsx:19-63` | `addTask()` + `findNextAvailableSlot()` + `addTimeBlock()` | YES |

### G. AI Chat (ScheduleChatFab + ChatPage)

Both `ScheduleChatFab.tsx` and `ChatPage.tsx` call `executeToolCalls()` which handles:

| AI Tool | File:Line | What happens | Overlap-safe? |
|---------|-----------|-------------|---------------|
| `create_tasks` | `planner-ai.ts:169-208` | Creates tasks, auto-schedules via `findNextAvailableSlot` | YES |
| `generate_schedule` | `planner-ai.ts:238-301` | Replaces all blocks for a date, resolves overlaps | PARTIAL (complex multi-step resolution) |
| `defer_task` | `planner-ai.ts:221-224` | Calls `store.deferTask()` | NO |
| `move_blocks_to_date` | `planner-ai.ts:329-357` | Moves blocks, has duplicate check, no resolveOverlaps | PARTIAL (dedup only) |
| `add_buffer_block` | `planner-ai.ts:313-327` | Pushes block into allBlocks array | NO |
| `complete_task` | `planner-ai.ts:216-219` | Toggles completion | N/A |
| `drop_task` | `planner-ai.ts:226-229` | Drops task + removes blocks | N/A |
| `update_task` | `planner-ai.ts:210-214` | Updates task properties | N/A |

---

## Part 2: The Three Root Causes

### Root Cause 1: MAX_OVERLAP = 3 (Intentional stacking)

**File**: `scheduling-utils.ts:76`
```
const MAX_OVERLAP = 3;
```

`resolveOverlaps()` intentionally allows up to 3 blocks to occupy the same time slot. Only a 4th block triggers displacement. This means:

- **2 blocks at 9am?** Allowed.
- **3 blocks at 9am?** Allowed.
- **4 blocks at 9am?** 4th gets displaced.

Every function that calls `resolveOverlaps()` inherits this behavior:
- `moveBlockToDate()` (store)
- `displaceBlock()` (store)
- `generate_schedule` (AI)
- Drag-and-drop

The UI renders overlapping blocks side-by-side using `computeOverlapLayout()` (`SchedulePage.tsx:172-204`), which splits them into columns. But this creates the visual "stacking" the user sees.

### Root Cause 2: No centralized validation gate

There is no single function like `setBlockTime(blockId, startHour, date)` that ALL scheduling changes go through. Instead:

- `addTimeBlock()` — just appends, no validation
- `addTimeBlocks()` — just appends, no validation
- `updateTimeBlock()` — just updates, no validation
- `setTimeBlocks()` — just replaces, no validation
- `moveBlockToDate()` — has resolveOverlaps (but MAX_OVERLAP=3)

**10 of 22 scheduling paths** use `updateTimeBlock()` or `addTimeBlock()` directly, bypassing any overlap check.

### Root Cause 3: Non-atomic multi-step operations

Several operations make **2+ separate state changes** that can interfere:

1. **BlockEditSheet save**: `moveBlockToDate()` → `updateTimeBlock()` (resolve, then override)
2. **Drag-and-drop**: `updateTimeBlock()` → `displaceBlock()` (two separate setState)
3. **RolloverModal Defer**: `deferTask()` → `moveBlockToDate()` (contradictory destinations)
4. **Cloud sync**: Local changes → 1s debounce → cloud save (window for cloud to overwrite)

---

## Part 3: How Each Button Works (Simple Explanation)

### On the Schedule Page (Calendar View)

| What you see | What it does | Can it cause overlap? |
|---|---|---|
| **Drag handle (⠿)** on a block | Lets you drag the block up/down to change its time. Snaps to 15-min grid. Calls `updateTimeBlock` to set new time, then `displaceBlock` to try to fix overlaps. | YES — two separate updates, and displaceBlock allows up to 3 overlaps |
| **Arrow (→) button** on a block | Moves the block to tomorrow. Calls `moveBlockToDate`. | YES — if tomorrow already has blocks at that time (up to 3 allowed) |
| **Checkbox (☐)** on a block | Marks the task complete/incomplete. No time change. | No |
| **Pencil (✎)** on a block | Opens the edit sheet for that task or block. | No (just opens modal) |
| **Swipe left/right** | Navigates to next/previous day. No schedule changes. | No |

### In the Task Detail Sheet (after tapping a task)

| What you see | What it does | Can it cause overlap? |
|---|---|---|
| **Time +/- buttons** | Shifts start time by 15 minutes. Calls `updateTimeBlock`. | YES — no overlap check |
| **Duration chips** (15m, 30m, 1h, etc.) | Changes how long the block is. Calls `updateTimeBlock`. | YES — extending a block can overlap the next one |
| **"Prev day" / "Next day"** | Moves block to adjacent date via `moveBlockToDate`. | YES — MAX_OVERLAP=3 |
| **"Today" button** | Moves block to today via `moveBlockToDate`. | YES — MAX_OVERLAP=3 |
| **Calendar date picker** | Moves block to chosen date via `moveBlockToDate`. | YES — MAX_OVERLAP=3 |
| **Drop button** | Removes the task and its blocks. | No |

### In the Block Edit Sheet (after tapping a non-task block)

| What you see | What it does | Can it cause overlap? |
|---|---|---|
| **Time +/- buttons** | Changes local state. Applied on Save. | YES (on Save, no overlap check) |
| **Duration chips/+/-** | Changes local state. Applied on Save. | YES (on Save, no overlap check) |
| **Date buttons** | Changes local state. Applied on Save. | YES (Save moves date then sets time — non-atomic) |
| **Save button** | If date changed: `moveBlockToDate` then `updateTimeBlock`. If only time changed: `updateTimeBlock`. | YES — both paths can cause overlap |
| **Delete button** | Removes the block. | No |

### In the RolloverModal (morning review)

| What you see | What it does | Can it cause overlap? |
|---|---|---|
| **"Done" button** | Marks task completed. Blocks stay where they are. | No |
| **"Keep" button** | Resets rollover count. Moves past blocks to today. | YES — MAX_OVERLAP=3 on today |
| **"Defer" button** | Increments rollover. Has a race condition between deferTask (→ tomorrow) and moveBlockToDate (→ today). | YES — race condition + no overlap check in deferTask |
| **"Drop" button** | Marks task dropped. Blocks stay. | No |
| **"Start my day" / X** | Dismisses the modal. | No |

### Via AI Chat (Quick Planner or Chat Page)

| What AI can do | Overlap-safe? |
|---|---|
| Create tasks (auto-scheduled) | YES |
| Generate full day schedule | PARTIAL (has conflict resolution, but complex) |
| Defer a task | NO |
| Move blocks to different dates | PARTIAL (duplicate check only, no overlap resolution) |
| Add buffer/break block | NO |

### Automatic (No User Action)

| System | When it runs | Overlap-safe? |
|---|---|---|
| **useTaskScheduleSync** | Every render of TasksPage, when tasks/timeBlocks change | YES (findNextAvailableSlot) |
| **useMealBlocks** | Every render of SchedulePage, when meal preferences change | NO (fixed times, ignores task blocks) |
| **Recurring generation** | On app mount (in store useEffect) | YES (findNextAvailableSlot) |
| **Cloud sync load** | On app mount | NO (replaces local state) |
| **Tab focus sync** | When tab regains visibility | NO (replaces local state) |
| **Real-time sync** | When another device changes data | NO (inserts without overlap check) |

---

## Part 4: The Overlap Flow Diagram

```
User opens app
    │
    ├─→ Cloud sync loads data (no overlap check) ───→ OVERLAP POSSIBLE
    ├─→ Cleanup old data
    ├─→ Generate recurring instances (findNextAvailableSlot) ✅
    │
    ├─→ SchedulePage mounts
    │     └─→ useMealBlocks runs (fixed times, no check) ───→ OVERLAP POSSIBLE
    │
    ├─→ TasksPage mounts
    │     └─→ useTaskScheduleSync runs (findNextAvailableSlot) ✅
    │
    └─→ RolloverModal shows (if applicable)
          ├─ Keep → moveBlockToDate (MAX_OVERLAP=3) ───→ OVERLAP POSSIBLE
          ├─ Defer → deferTask + moveBlockToDate (race) ───→ OVERLAP POSSIBLE
          └─ Done/Drop → no time change ✅

User interacts with schedule
    │
    ├─ Drag block → updateTimeBlock + displaceBlock ───→ OVERLAP POSSIBLE
    ├─ Move to Tomorrow → moveBlockToDate (MAX_OVERLAP=3) ───→ OVERLAP POSSIBLE
    ├─ Edit time +/- → updateTimeBlock (no check) ───→ OVERLAP POSSIBLE
    ├─ Change duration → updateTimeBlock (no check) ───→ OVERLAP POSSIBLE
    ├─ Change date → moveBlockToDate (MAX_OVERLAP=3) ───→ OVERLAP POSSIBLE
    ├─ BlockEditSheet Save → moveBlockToDate + updateTimeBlock ───→ OVERLAP POSSIBLE
    └─ Quick Add → findNextAvailableSlot ✅

AI modifies schedule
    │
    ├─ generate_schedule → conflict resolution ✅ (mostly)
    ├─ create_tasks → findNextAvailableSlot ✅
    ├─ defer_task → deferTask (no check) ───→ OVERLAP POSSIBLE
    ├─ move_blocks_to_date → dedup check only ───→ OVERLAP POSSIBLE
    └─ add_buffer_block → no check ───→ OVERLAP POSSIBLE

Tab regains focus / other device changes
    │
    └─→ Cloud data replaces local state ───→ OVERLAP POSSIBLE
```

---

## Part 5: Specific Scenarios That Create Overlaps

### Scenario 1: User adjusts time via +/- buttons
1. Task A at 9am, Task B at 10am
2. User opens Task A detail, presses time + four times (→ 9:15 → 9:30 → 9:45 → 10:00)
3. Task A now at 10am, same as Task B
4. **No overlap resolution happens** — both at 10am

### Scenario 2: User extends duration
1. Task A at 9-10am (1h), Task B at 10-11am
2. User opens Task A, changes duration to 2h
3. Task A now 9-11am, overlapping Task B at 10-11am
4. **No overlap resolution happens**

### Scenario 3: RolloverModal "Defer" race condition
1. Task A has a block on yesterday (March 12) at 2pm
2. User presses "Defer"
3. `deferTask()` changes block date to March 14 (tomorrow)
4. For-loop checks `b.date < today` — but React may still show March 12 (stale state)
5. `moveBlockToDate(b.id, today)` moves it to March 13 (today)
6. Block ends up on today, possibly overlapping

### Scenario 4: BlockEditSheet date + time change
1. Block at 9am on Monday, user edits in BlockEditSheet
2. User changes date to Tuesday and time to 10am
3. Save: `moveBlockToDate(id, Tuesday)` — resolves overlaps at 9am on Tuesday
4. Save: `updateTimeBlock(id, { startHour: 10 })` — sets time to 10am WITHOUT resolving
5. If Tuesday has a block at 10am, they now overlap

### Scenario 5: Meal blocks overlap task blocks
1. User has a task scheduled at 12pm
2. `useMealBlocks` runs and creates a "Lunch" block at 12pm
3. Both at 12pm — meal block doesn't check for task conflicts

### Scenario 6: Cloud sync overwrites resolved state
1. User drags a block, `displaceBlock()` resolves overlaps locally
2. Before the 1-second debounce saves to cloud, user switches tabs
3. On return, `loadFromCloud()` loads the OLD (unresolved) data
4. Overlaps are restored

### Scenario 7: Move to Tomorrow accumulates blocks
1. User moves block X to tomorrow (already has blocks A, B at 9am)
2. `moveBlockToDate` calls `resolveOverlaps` — MAX_OVERLAP=3, so X, A, B all at 9am
3. Next day, user moves another block Y to tomorrow (now today)
4. `resolveOverlaps` — 4 blocks, Y gets displaced, but X, A, B still overlap

---

## Part 6: The "Band-Aid" Pattern

The codebase shows a clear pattern of incremental fixes:

1. **Original**: No overlap checking at all — blocks placed wherever
2. **Band-Aid 1**: `findNextAvailableSlot()` added — avoids conflicts when placing NEW blocks
3. **Band-Aid 2**: `resolveOverlaps()` added — but with MAX_OVERLAP=3, so it's permissive
4. **Band-Aid 3**: `deduplicateBlocks()` added — catches duplicate titles, but too aggressive (removes legitimate same-title blocks)
5. **Band-Aid 4**: `generate_schedule` in `planner-ai.ts` has its own overlap resolution loop — separate from `resolveOverlaps()`
6. **Band-Aid 5**: `useTaskScheduleSync` hook added — failsafe for orphaned tasks, but re-triggers on every state change
7. **Band-Aid 6**: AI system prompt tells GPT "blocks must NOT overlap" — but enforcement is on the client side

Each fix addresses one path but doesn't create a centralized gate, so when new features are added (or existing ones modified), they can bypass all previous fixes.

---

## Part 7: Architectural Recommendation (Summary)

The fundamental fix requires:

1. **A single validation gate**: Every block time change should go through ONE function that checks for and resolves overlaps BEFORE updating state. This replaces the scattered `updateTimeBlock` / `addTimeBlock` / `moveBlockToDate` / `deferTask` calls.

2. **MAX_OVERLAP = 1**: Change the overlap threshold from 3 to 1. Blocks should never share a time slot (except possibly meals/breaks as a design choice, handled separately).

3. **Atomic multi-step operations**: Combine date change + time change into a single state update, rather than two separate calls that can interfere.

4. **Cloud sync conflict resolution**: When cloud data arrives, run overlap resolution on the merged result rather than blindly replacing local state.

---

## Part 8: Test Results

All audit tests pass, confirming the issues documented above:

```
AUDIT: resolveOverlaps — MAX_OVERLAP allows stacking (3 tests)
AUDIT: deferTask — overlap on target date (1 test)
AUDIT: RolloverModal — keep/defer actions (2 tests)
AUDIT: useTaskScheduleSync — orphan block creation (2 tests)
AUDIT: useMealBlocks — meal blocks can overlap tasks (1 test)
AUDIT: BlockEditSheet — save after date + time change (1 test)
AUDIT: Drag-and-drop — two separate state updates (1 test)
AUDIT: Move to Tomorrow button (1 test)
AUDIT: TaskDetailSheet — time adjustment buttons (2 tests)
AUDIT: QuickAddTask — overlap avoidance (2 tests)
AUDIT: Recurring instances — overlap with existing blocks (2 tests)
AUDIT: Cloud sync — state replacement risks (1 test)
AUDIT: Multiple scheduling passes — duplicate blocks (2 tests)
AUDIT: generate_schedule + move_blocks_to_date interaction (1 test)
AUDIT: Duration change — no overlap check (1 test)
AUDIT SUMMARY: Which paths have overlap protection? (1 test)

24 tests passed
```

The existing test suite also has 1 pre-existing failure that documents this same issue:
- `resolveOverlaps > pushes overlapping blocks forward when a block is moved` — expects block B to be pushed away when block A overlaps it, but MAX_OVERLAP=3 allows both at the same time.
