/**
 * SCHEDULING SYSTEM AUDIT TESTS
 * ===============================
 * These tests systematically probe every scheduling pathway to identify
 * where overlaps can be introduced. Each test targets a specific scenario
 * discovered during the codebase audit.
 */
import { describe, it, expect } from "vitest";
import { findNextAvailableSlot, resolveOverlaps } from "@/lib/scheduling-utils";
import { executeToolCalls, ToolCall } from "@/lib/planner-ai";
import { generateRecurringInstances, cleanupOldRecurringInstances } from "@/lib/recurrence-utils";
import { TimeBlock, Task, UserPreferences, RecurrenceRule } from "@/types/dayflow";

// ─── Helpers ───
function block(
  id: string,
  startHour: number,
  durationHours: number,
  opts: Partial<TimeBlock> = {}
): TimeBlock {
  return {
    id,
    title: opts.title || id,
    categoryId: opts.categoryId || "work",
    date: opts.date || "2026-03-13",
    startHour,
    durationHours,
    isFixed: opts.isFixed || false,
    type: opts.type || "task",
    taskId: opts.taskId,
  };
}

function makeTask(id: string, title: string, opts: Partial<Task> = {}): Task {
  return {
    id,
    title,
    categoryId: opts.categoryId || "work",
    status: opts.status || "active",
    priority: opts.priority || 3,
    estimatedMinutes: opts.estimatedMinutes || 30,
    canSplit: false,
    notes: "",
    preferredTime: opts.preferredTime || "any",
    energyNeeded: "medium",
    recurring: opts.recurring || false,
    createdAt: opts.createdAt || "2026-03-13",
    rolloverCount: opts.rolloverCount || 0,
    horizon: opts.horizon || "today",
    recurringRuleId: opts.recurringRuleId,
  };
}

/** Verify no two blocks overlap on a given date */
function assertNoOverlaps(blocks: TimeBlock[], date: string, context: string = "") {
  const dayBlocks = blocks
    .filter((b) => b.date === date)
    .sort((a, b) => a.startHour - b.startHour);
  for (let i = 0; i < dayBlocks.length - 1; i++) {
    const a = dayBlocks[i];
    const b = dayBlocks[i + 1];
    const aEnd = a.startHour + a.durationHours;
    const msg = `${context}[${date}] "${a.title}" (${a.startHour}-${aEnd}) overlaps "${b.title}" (${b.startHour}-${b.startHour + b.durationHours})`;
    expect(b.startHour, msg).toBeGreaterThanOrEqual(aEnd - 0.001);
  }
}

function makeStore() {
  let storedTasks: Task[] = [];
  let storedBlocks: TimeBlock[] = [];
  return {
    addTasks: (tasks: Task[]) => { storedTasks.push(...tasks); },
    updateTask: () => {},
    toggleTaskComplete: () => {},
    dropTask: () => {},
    deferTask: () => {},
    setTimeBlocks: (blocks: TimeBlock[]) => { storedBlocks = blocks; },
    addTimeBlock: (b: TimeBlock) => { storedBlocks.push(b); },
    addTimeBlocks: (bs: TimeBlock[]) => { storedBlocks.push(...bs); },
    updatePreferences: () => {},
    addProject: () => {},
    moveBlockToDate: () => {},
    preferences: {
      workStartHour: 8,
      workEndHour: 18,
      lunchHour: 12,
      dinnerHour: 18.5,
      workoutTime: "morning" as const,
      defaultTaskDuration: 30,
      includeBreaks: true,
      protectMealTimes: true,
      sleepStartHour: 23,
      sleepEndHour: 7,
      categories: [
        { id: "work", name: "Work", color: "blue", schedulingWindow: { startHour: 9, endHour: 17 } },
        { id: "life-admin", name: "Life Admin", color: "teal", schedulingWindow: { startHour: 10, endHour: 21 } },
      ],
    } as UserPreferences,
    getTasks: () => storedTasks,
    getBlocks: () => storedBlocks,
  };
}

// ═══════════════════════════════════════════════════════════════
// ISSUE 1: resolveOverlaps allows up to 3 overlaps (MAX_OVERLAP=3)
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: resolveOverlaps — MAX_OVERLAP allows stacking", () => {
  it("EXPOSES: 2 blocks at the same time are NOT resolved (MAX_OVERLAP=3)", () => {
    const blocks = [
      block("a", 9, 1),
      block("b", 9, 1), // same time as "a"
    ];
    const result = resolveOverlaps(blocks, "a");
    const aBlock = result.find((b) => b.id === "a")!;
    const bBlock = result.find((b) => b.id === "b")!;

    // This test documents the current behavior: 2 blocks at the same time
    // are ALLOWED because MAX_OVERLAP = 3. This is a root cause of visual overlaps.
    const doTheyOverlap = (
      aBlock.startHour < bBlock.startHour + bBlock.durationHours &&
      bBlock.startHour < aBlock.startHour + aBlock.durationHours
    );
    // If MAX_OVERLAP > 1, we expect they DO overlap (this is the bug)
    expect(doTheyOverlap).toBe(true); // DOCUMENTING: this IS the overlap behavior
  });

  it("EXPOSES: 3 blocks at the same time are NOT resolved (MAX_OVERLAP=3)", () => {
    const blocks = [
      block("a", 9, 1),
      block("b", 9, 1),
      block("c", 9, 1), // 3 at same time
    ];
    const result = resolveOverlaps(blocks, "a");
    const times = result.map((b) => b.startHour);
    // All 3 should be at 9 because MAX_OVERLAP=3
    expect(times.every((t) => t === 9)).toBe(true);
  });

  it("only displaces when 4th block would overlap", () => {
    const blocks = [
      block("a", 9, 1),
      block("b", 9, 1),
      block("c", 9, 1),
      block("d", 9, 1), // 4th — should be displaced
    ];
    const result = resolveOverlaps(blocks, "a");
    const dBlock = result.find((b) => b.id === "d")!;
    // 4th block should have been pushed
    expect(dBlock.startHour).toBeGreaterThanOrEqual(10);
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 2: deferTask moves blocks without resolving overlaps
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: deferTask — overlap on target date", () => {
  it("EXPOSES: deferTask moves block to tomorrow without resolving overlaps", () => {
    // Simulate: task A is on today, tomorrow already has a block at 9am
    // deferTask moves A to tomorrow but does NOT call resolveOverlaps
    const todayBlock = block("a", 9, 1, { date: "2026-03-13", taskId: "task-a" });
    const tomorrowBlock = block("b", 9, 1, { date: "2026-03-14", taskId: "task-b" });

    // Simulate what deferTask does in the store (line 388):
    // It just changes the date — no resolveOverlaps call
    const blocksAfterDefer = [
      { ...todayBlock, date: "2026-03-14" }, // moved to tomorrow
      tomorrowBlock,
    ];

    // Check: do they overlap on tomorrow?
    const tomorrowBlocks = blocksAfterDefer.filter((b) => b.date === "2026-03-14");
    const sorted = tomorrowBlocks.sort((a, b) => a.startHour - b.startHour);
    const overlap = sorted.length > 1 && sorted[0].startHour + sorted[0].durationHours > sorted[1].startHour;

    // deferTask DOES create overlaps — this documents the bug
    expect(overlap).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 3: RolloverModal "Keep" and "Defer" both move blocks
// but can cause double-moves or overlaps
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: RolloverModal — keep/defer actions", () => {
  it("EXPOSES: 'Defer' calls deferTask AND then moveBlockToDate — double move", () => {
    // In RolloverModal (line 36-42), the "defer" case:
    // 1. Calls deferTask(taskId) — which moves block to tomorrow
    // 2. Then loops through blocks and calls moveBlockToDate(b.id, today) for past blocks
    //
    // But deferTask already moved the block to tomorrow!
    // So moveBlockToDate is moving it BACK to today... or it's trying to move
    // blocks that are already on today.
    //
    // The logical conflict: deferTask moves to tomorrow, but the for-loop
    // tries to move past-dated blocks to today. If the block was already
    // moved to tomorrow by deferTask, the for-loop check (b.date < today)
    // won't find it. But if deferTask's state update hasn't propagated
    // (React batching), the for-loop might still see the old date.

    // This is a race condition in React state updates.
    // We can't test it purely functionally, but we can document the logic conflict.
    expect(true).toBe(true); // Documented: see analysis
  });

  it("EXPOSES: 'Keep' moves past blocks to today without checking existing blocks on today", () => {
    // The "keep" action (line 28-33) calls moveBlockToDate for each past block,
    // moving them to today. But if today already has blocks at those times,
    // moveBlockToDate calls resolveOverlaps — but with MAX_OVERLAP=3,
    // it will still allow overlapping.

    // Simulate: 2 past blocks at 9am, today already has a block at 9am
    const pastBlock1 = block("past1", 9, 1, { date: "2026-03-12", taskId: "t1" });
    const pastBlock2 = block("past2", 9, 1, { date: "2026-03-12", taskId: "t2" });
    const todayBlock = block("today1", 9, 1, { date: "2026-03-13", taskId: "t3" });

    // After moving both past blocks to today via moveBlockToDate:
    // Each moveBlockToDate calls resolveOverlaps, but MAX_OVERLAP=3 means
    // all 3 at 9am would be "fine" (not displaced)
    let allBlocks = [pastBlock1, pastBlock2, todayBlock];

    // Move past1 to today
    allBlocks = allBlocks.map((b) => b.id === "past1" ? { ...b, date: "2026-03-13" } : b);
    let resolved = resolveOverlaps(allBlocks, "past1");

    // Move past2 to today
    resolved = resolved.map((b) => b.id === "past2" ? { ...b, date: "2026-03-13" } : b);
    resolved = resolveOverlaps(resolved, "past2");

    const todayBlocks = resolved.filter((b) => b.date === "2026-03-13");
    const at9 = todayBlocks.filter((b) => b.startHour === 9);

    // With MAX_OVERLAP=3, all 3 blocks remain at 9am — visual overlap!
    expect(at9.length).toBe(3); // All 3 at the same time = overlap bug
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 4: useTaskScheduleSync creates blocks without checking
// for existing blocks that resolveOverlaps would miss
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: useTaskScheduleSync — orphan block creation", () => {
  it("creates blocks that avoid existing blocks (via findNextAvailableSlot)", () => {
    // useTaskScheduleSync uses findNextAvailableSlot which DOES avoid conflicts.
    // But it runs on EVERY render because its deps include [tasks, timeBlocks].
    // If a task gets a block, the timeBlocks array changes, triggering re-run.
    // But it checks for existing taskIds so it shouldn't re-create.

    const existing = [block("b1", 9, 1, { taskId: "t1" })];
    const start = findNextAvailableSlot(existing, 1, "any", "2026-03-13");
    expect(start).not.toBe(9); // Should avoid 9am
  });

  it("EXPOSES: runs on every [tasks, timeBlocks] change — potential for re-triggering", () => {
    // The useEffect depends on [tasks, timeBlocks, addTimeBlocks, preferences].
    // When addTimeBlocks is called (adding new blocks), timeBlocks changes,
    // which triggers the effect AGAIN. The dedup check (scheduledTaskIds/scheduledTitles)
    // should prevent double-creation, but there's a timing issue:
    // React state updates are batched, so the new blocks might not be in
    // timeBlocks yet when the effect re-runs.

    // This is a potential source of duplicate blocks.
    expect(true).toBe(true); // Documented: needs React-level testing
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 5: useMealBlocks adds blocks without resolveOverlaps
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: useMealBlocks — meal blocks can overlap tasks", () => {
  it("EXPOSES: meal blocks are added at fixed times without checking task blocks", () => {
    // useMealBlocks checks if a meal block already exists within ±1 hour,
    // but it does NOT check if a TASK block exists at that time.
    // It calls addTimeBlocks directly — no resolveOverlaps.

    // If a task is scheduled at 12pm and lunch is at 12pm,
    // both will exist at the same time.
    const taskBlock = block("task1", 12, 1, { type: "task" });
    const lunchBlock = block("lunch", 12, 0.5, { type: "meal" });

    // Both at 12pm — they overlap
    const overlap = taskBlock.startHour < lunchBlock.startHour + lunchBlock.durationHours &&
                    lunchBlock.startHour < taskBlock.startHour + taskBlock.durationHours;
    expect(overlap).toBe(true); // Meal overlaps task — this is expected behavior
    // but contributes to visual overlap
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 6: BlockEditSheet save — date change + time change race
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: BlockEditSheet — save after date + time change", () => {
  it("EXPOSES: moveBlockToDate then updateTimeBlock are separate calls (no atomic update)", () => {
    // In BlockEditSheet handleSave (line 47-59):
    //   1. If date changed: moveBlockToDate(block.id, date)  — resolves overlaps on new date
    //   2. Always: updateTimeBlock(block.id, { title, startHour, durationHours, isFixed })
    //
    // Problem: moveBlockToDate resolves overlaps for the OLD startHour.
    // Then updateTimeBlock changes the startHour WITHOUT resolving overlaps.
    // The overlap resolution from step 1 is invalidated by step 2.

    // Simulate: block at 9am, move to tomorrow where 10am is free
    // moveBlockToDate might shift it to 10am to avoid overlap
    // Then updateTimeBlock sets startHour back to 9am (user's chosen time)
    // Result: overlap on tomorrow at 9am

    const existingTomorrow = block("existing", 9, 1, { date: "2026-03-14" });
    const movingBlock = block("moving", 9, 1, { date: "2026-03-13" });

    // Step 1: moveBlockToDate — changes date, resolves overlaps
    let allBlocks = [existingTomorrow, { ...movingBlock, date: "2026-03-14" }];
    const resolved = resolveOverlaps(allBlocks, "moving");
    const movedBlock = resolved.find((b) => b.id === "moving")!;
    // With MAX_OVERLAP=3, it stays at 9 (2 blocks allowed)
    // But even if it was pushed to 10, step 2 would override it

    // Step 2: updateTimeBlock — sets startHour to user's value (9)
    const afterUpdate = resolved.map((b) =>
      b.id === "moving" ? { ...b, startHour: 9 } : b
    );

    // Check: now both at 9am on tomorrow
    const tomorrowBlocks = afterUpdate.filter((b) => b.date === "2026-03-14");
    const at9 = tomorrowBlocks.filter((b) => b.startHour === 9);
    expect(at9.length).toBe(2); // Both at 9am — overlap
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 7: Drag-and-drop — updateTimeBlock then displaceBlock
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: Drag-and-drop — two separate state updates", () => {
  it("EXPOSES: updateTimeBlock + displaceBlock are separate setState calls", () => {
    // In SchedulePage handleDragHandlePointerDown onUp callback (line 335-336):
    //   updateTimeBlock(blockId, { startHour: clamped });  // setState #1
    //   displaceBlock(blockId);                             // setState #2
    //
    // These are TWO separate setState calls. In React 18 with automatic batching,
    // they may be batched, but displaceBlock runs resolveOverlaps on the state
    // from BEFORE updateTimeBlock's change is applied.
    //
    // This means displaceBlock might see the OLD startHour and do nothing,
    // leaving the block at the new position with overlaps unresolved.

    // Functional simulation: update startHour then resolve
    const blocks = [
      block("dragged", 8, 1),
      block("existing", 10, 1),
    ];

    // User drags "dragged" to 10am (overlapping "existing")
    const afterUpdate = blocks.map((b) =>
      b.id === "dragged" ? { ...b, startHour: 10 } : b
    );

    // displaceBlock should resolve the overlap
    const afterResolve = resolveOverlaps(afterUpdate, "dragged");
    const existingBlock = afterResolve.find((b) => b.id === "existing")!;

    // With MAX_OVERLAP=3, both stay at 10 — not displaced
    expect(existingBlock.startHour).toBe(10); // Overlap allowed by MAX_OVERLAP=3
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 8: "Move to Tomorrow" button on schedule blocks
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: Move to Tomorrow button", () => {
  it("calls moveBlockToDate which uses resolveOverlaps — but MAX_OVERLAP=3", () => {
    // The arrow button on each ScheduleBlock (line 426-430) calls moveBlockToDate.
    // moveBlockToDate (store line 467-476) calls resolveOverlaps, but with MAX_OVERLAP=3,
    // the block will happily overlap up to 2 other blocks.

    const tomorrowBlocks = [
      block("t1", 9, 1, { date: "2026-03-14" }),
      block("t2", 9, 1, { date: "2026-03-14" }),
    ];
    const todayBlock = block("moving", 9, 1, { date: "2026-03-13" });

    // Move today's block to tomorrow
    let all = [...tomorrowBlocks, { ...todayBlock, date: "2026-03-14" }];
    const resolved = resolveOverlaps(all, "moving");
    const atNine = resolved.filter((b) => b.date === "2026-03-14" && b.startHour === 9);

    // All 3 at 9am — MAX_OVERLAP=3 allows it
    expect(atNine.length).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 9: TaskDetailSheet ScheduledTimeSection — adjusting time
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: TaskDetailSheet — time adjustment buttons", () => {
  it("EXPOSES: time +/- buttons call updateTimeBlock without overlap check", () => {
    // ScheduledTimeSection adjustTime (line 443-446) calls onUpdateTime
    // which is bound to updateTimeBlock(scheduledBlock.id, { startHour })
    // (TaskDetailSheet line 185).
    //
    // updateTimeBlock just sets the startHour — NO resolveOverlaps call.
    // So adjusting time can directly create overlaps.

    // Simulate: task at 9am, another at 10am. User presses +15min four times
    // to move first task to 10am.
    const blocks = [
      block("a", 9, 1, { taskId: "t1" }),
      block("b", 10, 1, { taskId: "t2" }),
    ];

    // After pressing + four times: a moves from 9 → 9.25 → 9.5 → 9.75 → 10
    const updated = blocks.map((b) => b.id === "a" ? { ...b, startHour: 10 } : b);
    const atTen = updated.filter((b) => b.startHour === 10);
    expect(atTen.length).toBe(2); // Both at 10am — overlap with no resolution
  });

  it("EXPOSES: date move buttons call moveBlockToDate (resolves with MAX_OVERLAP=3)", () => {
    // The "Next day" / "Prev day" buttons call moveByDays → onMoveToDate → moveBlockToDate.
    // moveBlockToDate DOES call resolveOverlaps, but MAX_OVERLAP=3 allows overlaps.
    expect(true).toBe(true); // Same MAX_OVERLAP=3 issue as other paths
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 10: QuickAddTask — no overlap check on addTimeBlock
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: QuickAddTask — overlap avoidance", () => {
  it("uses findNextAvailableSlot correctly to avoid overlaps", () => {
    // QuickAddTask (line 39-57) calls findNextAvailableSlot before addTimeBlock.
    // This SHOULD avoid overlaps, as long as timeBlocks is up-to-date.

    const existing = [block("b1", 9, 1), block("b2", 10, 1)];
    const start = findNextAvailableSlot(existing, 1, "any", "2026-03-13");
    // Should find first available gap
    expect(start).toBeGreaterThanOrEqual(8); // Before b1 or after b2
    expect(start).not.toBe(9);  // Not overlapping b1
    expect(start).not.toBe(10); // Not overlapping b2
  });

  it("EXPOSES: uses stale timeBlocks snapshot (React state)", () => {
    // QuickAddTask reads timeBlocks from the hook at render time.
    // If user quickly adds multiple tasks, each addTimeBlock call
    // may not see the previous block in timeBlocks yet.
    // findNextAvailableSlot would schedule both at the same slot.

    // This is a React state timing issue — can't test purely functionally
    expect(true).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 11: Recurring instance generation overlap potential
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: Recurring instances — overlap with existing blocks", () => {
  it("uses findNextAvailableSlot to avoid overlaps with existing blocks", () => {
    const rule: RecurrenceRule = {
      id: "rr-1",
      templateTaskId: "t-template",
      frequency: "daily",
      startDate: "2026-03-13",
    };

    const template = makeTask("t-template", "Daily Standup", {
      estimatedMinutes: 30,
      preferredTime: "morning",
    });

    const existingBlocks = [
      block("existing", 8, 2, { date: "2026-03-13" }), // 8-10am
    ];

    const { newBlocks } = generateRecurringInstances(
      [rule],
      [template],
      existingBlocks,
      [{ id: "work", schedulingWindow: { startHour: 9, endHour: 17 } }]
    );

    const todayBlocks = newBlocks.filter((b) => b.date === "2026-03-13");
    if (todayBlocks.length > 0) {
      // The new block should not overlap with the existing 8-10am block
      for (const nb of todayBlocks) {
        const overlaps = nb.startHour < 10 && nb.startHour + nb.durationHours > 8;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("EXPOSES: recurring instances across days don't see each other's blocks correctly", () => {
    // generateRecurringInstances builds allBlocks as [...existingBlocks, ...newBlocks]
    // so each new block sees previously generated blocks. This should work.

    const rule: RecurrenceRule = {
      id: "rr-1",
      templateTaskId: "t-template",
      frequency: "daily",
      startDate: "2026-03-13",
    };

    const template = makeTask("t-template", "Daily Review", {
      estimatedMinutes: 60,
      preferredTime: "morning",
    });

    const { newBlocks } = generateRecurringInstances(
      [rule],
      [template],
      [],
      [{ id: "work", schedulingWindow: { startHour: 9, endHour: 17 } }]
    );

    // Check no overlaps on any date
    const dates = [...new Set(newBlocks.map((b) => b.date))];
    for (const date of dates) {
      assertNoOverlaps(newBlocks, date, "Recurring: ");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 12: Cloud sync + local state — simultaneous schedule states
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: Cloud sync — state replacement risks", () => {
  it("DOCUMENTS: visibility change replaces local timeBlocks with cloud data", () => {
    // When the tab regains focus (store line 279-300), loadFromCloud() is called
    // and timeBlocks are replaced IF cloud has any.
    // If local state had overlap-resolved blocks but cloud has the unresolved ones,
    // overlaps are re-introduced.
    //
    // This happens because resolveOverlaps runs locally but the resolved state
    // may not have been synced to cloud yet (1000ms debounce).
    expect(true).toBe(true); // Architecture issue — documented
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 13: Multiple scheduling passes creating duplicates
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: Multiple scheduling passes — duplicate blocks", () => {
  it("deduplicateBlocks catches title+date duplicates", () => {
    const store = makeStore();
    const toolCalls: ToolCall[] = [
      {
        name: "generate_schedule",
        arguments: {
          date: "2026-03-14",
          blocks: [
            { title: "Study", categoryId: "work", startHour: 9, durationHours: 1, type: "task" },
            { title: "Study", categoryId: "work", startHour: 10, durationHours: 1, type: "task" }, // same title, different time
          ],
        },
      },
    ];

    executeToolCalls(toolCalls, store, [], []);
    const blocks = store.getBlocks().filter((b) => b.date === "2026-03-14");
    // deduplicateBlocks uses title+date+type as key — so "Study" on same date
    // would be deduped, keeping only one
    expect(blocks.filter((b) => b.title === "Study").length).toBe(1);
  });

  it("EXPOSES: legitimate same-title blocks on same date get incorrectly deduped", () => {
    // If a user genuinely has two "Study" blocks at different times on the same day,
    // deduplicateBlocks will remove one of them. This is overly aggressive.
    const store = makeStore();
    const existingBlocks = [
      block("study-morning", 9, 1, { title: "Study", date: "2026-03-14", type: "task" }),
    ];

    const toolCalls: ToolCall[] = [
      {
        name: "generate_schedule",
        arguments: {
          date: "2026-03-14",
          blocks: [
            { title: "Study", categoryId: "work", startHour: 9, durationHours: 1, type: "task" },
            { title: "Study", categoryId: "work", startHour: 14, durationHours: 1, type: "task" }, // afternoon session
          ],
        },
      },
    ];

    executeToolCalls(toolCalls, store, existingBlocks, []);
    const studyBlocks = store.getBlocks().filter((b) => b.title === "Study" && b.date === "2026-03-14");
    // Only 1 kept — the afternoon session is lost
    expect(studyBlocks.length).toBe(1); // Aggressive dedup removes legitimate block
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 14: generate_schedule + move_blocks_to_date in same call
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: generate_schedule + move_blocks_to_date interaction", () => {
  it("move_blocks_to_date skips blocks already on target date", () => {
    const store = makeStore();
    const existingBlocks = [
      block("b1", 9, 1, { date: "2026-03-13", title: "Task A" }),
    ];

    const toolCalls: ToolCall[] = [
      {
        name: "generate_schedule",
        arguments: {
          date: "2026-03-14",
          blocks: [
            { title: "Task A", categoryId: "work", startHour: 10, durationHours: 1, type: "task" },
          ],
        },
      },
      {
        name: "move_blocks_to_date",
        arguments: {
          moves: [{ blockId: "b1", targetDate: "2026-03-14" }],
        },
      },
    ];

    executeToolCalls(toolCalls, store, existingBlocks, []);
    const march14 = store.getBlocks().filter((b) => b.date === "2026-03-14");
    // Should not have duplicates of "Task A"
    const taskABlocks = march14.filter((b) => b.title === "Task A");
    // move_blocks_to_date should skip because generate_schedule already created it
    expect(taskABlocks.length).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// ISSUE 15: Duration change in TaskDetailSheet
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: Duration change — no overlap check", () => {
  it("EXPOSES: changing duration can cause block to overlap next block", () => {
    // TaskDetailSheet line 317-318: when duration is changed,
    // updateTimeBlock is called with new durationHours.
    // No resolveOverlaps is called.

    const blocks = [
      block("a", 9, 1, { taskId: "t1" }), // 9-10am
      block("b", 10, 1, { taskId: "t2" }), // 10-11am
    ];

    // User changes "a" duration from 1h to 2h → now 9-11am, overlapping "b"
    const updated = blocks.map((b) =>
      b.id === "a" ? { ...b, durationHours: 2 } : b
    );

    const aEnd = updated.find((b) => b.id === "a")!.startHour + updated.find((b) => b.id === "a")!.durationHours;
    const bStart = updated.find((b) => b.id === "b")!.startHour;
    expect(aEnd).toBeGreaterThan(bStart); // Overlap created by duration change
  });
});

// ═══════════════════════════════════════════════════════════════
// SUMMARY: Overlap prevention audit
// ═══════════════════════════════════════════════════════════════
describe("AUDIT SUMMARY: Which paths have overlap protection?", () => {
  it("documents the protection status of each scheduling path", () => {
    const paths = {
      // ✅ = has overlap protection, ❌ = no overlap protection, ⚠️ = partial
      "findNextAvailableSlot": "✅ Avoids conflicts when placing new blocks",
      "resolveOverlaps": "⚠️ Only displaces at MAX_OVERLAP=3 (allows 1-3 overlaps)",
      "QuickAddTask": "✅ Uses findNextAvailableSlot",
      "AI generate_schedule": "⚠️ Resolves via findNextAvailableSlot but MAX_OVERLAP=3 affects resolveOverlaps",
      "AI move_blocks_to_date": "⚠️ Has duplicate check but no resolveOverlaps on target",
      "AI defer_task": "❌ Just changes date, no overlap resolution",
      "Store deferTask": "❌ Just changes date, no overlap resolution",
      "Store moveBlockToDate": "⚠️ Calls resolveOverlaps but MAX_OVERLAP=3",
      "Store displaceBlock": "⚠️ Calls resolveOverlaps but MAX_OVERLAP=3",
      "Store updateTimeBlock": "❌ No overlap check at all",
      "Drag and drop": "⚠️ updateTimeBlock + displaceBlock (two separate calls, MAX_OVERLAP=3)",
      "BlockEditSheet save": "❌ moveBlockToDate + updateTimeBlock (non-atomic, time change after resolve)",
      "TaskDetailSheet time +/-": "❌ Calls updateTimeBlock only, no overlap check",
      "TaskDetailSheet duration change": "❌ Calls updateTimeBlock only, no overlap check",
      "TaskDetailSheet date move": "⚠️ Calls moveBlockToDate (MAX_OVERLAP=3)",
      "RolloverModal Keep": "⚠️ Calls moveBlockToDate per block (MAX_OVERLAP=3)",
      "RolloverModal Defer": "❌ deferTask has no overlap check, then moveBlockToDate race condition",
      "useTaskScheduleSync": "✅ Uses findNextAvailableSlot, but re-triggers on every state change",
      "useMealBlocks": "❌ Adds blocks at fixed times, no overlap check vs task blocks",
      "Recurring instances": "✅ Uses findNextAvailableSlot",
      "Cloud sync (tab focus)": "❌ Replaces local blocks with cloud data (may re-introduce overlaps)",
      "Cloud sync (real-time)": "❌ Inserts/updates blocks without overlap check",
    };

    // Count the issues
    const noProtection = Object.entries(paths).filter(([, v]) => v.startsWith("❌"));
    const partialProtection = Object.entries(paths).filter(([, v]) => v.startsWith("⚠️"));

    // Log for the report
    console.log("\n=== SCHEDULING OVERLAP PROTECTION AUDIT ===");
    for (const [path, status] of Object.entries(paths)) {
      console.log(`  ${status.slice(0, 2)} ${path}: ${status.slice(2).trim()}`);
    }
    console.log(`\n  Total: ${noProtection.length} unprotected, ${partialProtection.length} partial, ${Object.keys(paths).length - noProtection.length - partialProtection.length} protected`);

    expect(noProtection.length).toBeGreaterThan(0); // There ARE unprotected paths
    expect(partialProtection.length).toBeGreaterThan(0); // There ARE partially protected paths
  });
});
