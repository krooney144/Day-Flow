import { describe, it, expect } from "vitest";
import { findNextAvailableSlot, resolveOverlaps } from "@/lib/scheduling-utils";
import { executeToolCalls, ToolCall } from "@/lib/planner-ai";
import { TimeBlock, Task, UserPreferences } from "@/types/dayflow";

// ─── Helper to create a block ───
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

// ─── findNextAvailableSlot tests ───
describe("findNextAvailableSlot", () => {
  it("returns earliest available slot with no existing blocks", () => {
    const start = findNextAvailableSlot([], 1, "any", "2026-03-13");
    expect(start).toBe(8); // default "any" range starts at 8
  });

  it("avoids existing occupied blocks", () => {
    const existing = [block("b1", 8, 1), block("b2", 9, 1)];
    const start = findNextAvailableSlot(existing, 1, "any", "2026-03-13");
    expect(start).toBe(10);
  });

  it("respects currentHour — never schedules before now", () => {
    const existing = [block("b1", 8, 1)];
    const start = findNextAvailableSlot(existing, 0.5, "any", "2026-03-13", 14);
    expect(start).toBeGreaterThanOrEqual(14);
  });

  it("fits into gaps between blocks", () => {
    const existing = [block("b1", 8, 1), block("b2", 10, 1)];
    const start = findNextAvailableSlot(existing, 1, "any", "2026-03-13");
    expect(start).toBe(9); // 9-10 is free, fits 1h
  });

  it("skips gaps that are too small", () => {
    const existing = [block("b1", 8, 1), block("b2", 9.5, 1)];
    // 9-9.5 gap = 0.5h, can't fit 1h
    const start = findNextAvailableSlot(existing, 1, "any", "2026-03-13");
    expect(start).toBeGreaterThanOrEqual(10.5);
  });

  it("handles 15-minute blocks correctly", () => {
    const existing = [block("b1", 9, 0.25)];
    const start = findNextAvailableSlot(existing, 0.25, "any", "2026-03-13");
    // Should fit at 8 (before b1) or at 9.25 (after b1)
    expect(start).toBe(8); // 8 is earliest in "any" range
  });

  it("handles dense schedule without infinite loop", () => {
    // Fill 7-22 with 1h blocks (covers both preferred and fallback ranges)
    const existing = Array.from({ length: 15 }, (_, i) =>
      block(`b${i}`, 7 + i, 1)
    );
    const start = findNextAvailableSlot(existing, 1, "any", "2026-03-13");
    // When all slots are exhausted, function returns fallback (8)
    expect(start).toBeDefined();
  });
});

// ─── resolveOverlaps tests ───
describe("resolveOverlaps", () => {
  it("does nothing when no overlaps", () => {
    const blocks = [block("a", 8, 1), block("b", 9, 1), block("c", 10, 1)];
    const result = resolveOverlaps(blocks, "a");
    const sorted = result.sort((a, b) => a.startHour - b.startHour);
    expect(sorted[0].startHour).toBe(8);
    expect(sorted[1].startHour).toBe(9);
    expect(sorted[2].startHour).toBe(10);
  });

  it("pushes overlapping blocks forward when a block is moved", () => {
    // Move "a" to overlap with "b"
    const blocks = [
      block("a", 9, 1), // moved to 9, overlaps b
      block("b", 9, 1),
      block("c", 11, 1),
    ];
    const result = resolveOverlaps(blocks, "a");
    const bBlock = result.find((b) => b.id === "b");
    // b should be pushed to 10 (after a ends)
    expect(bBlock!.startHour).toBeGreaterThanOrEqual(10);
  });

  it("never moves fixed blocks", () => {
    const blocks = [
      block("moved", 9, 1),
      block("fixed", 9, 1, { isFixed: true }),
      block("flex", 10, 1),
    ];
    const result = resolveOverlaps(blocks, "moved");
    const fixedBlock = result.find((b) => b.id === "fixed");
    expect(fixedBlock!.startHour).toBe(9); // unchanged
  });
});

// ─── executeToolCalls: overlap resolution ───
describe("executeToolCalls — overlap resolution", () => {
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
      addTimeBlock: (block: TimeBlock) => { storedBlocks.push(block); },
      addTimeBlocks: (blocks: TimeBlock[]) => { storedBlocks.push(...blocks); },
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
        categories: [],
      } as UserPreferences,
      getTasks: () => storedTasks,
      getBlocks: () => storedBlocks,
    };
  }

  it("resolves overlapping blocks from AI generate_schedule", () => {
    const store = makeStore();
    // AI generates overlapping blocks at the same time
    const toolCalls: ToolCall[] = [
      {
        name: "generate_schedule",
        arguments: {
          date: "2026-03-14",
          blocks: [
            { title: "Task A", categoryId: "work", startHour: 9, durationHours: 1, type: "task" },
            { title: "Task B", categoryId: "work", startHour: 9, durationHours: 1, type: "task" }, // OVERLAP!
            { title: "Task C", categoryId: "work", startHour: 10, durationHours: 1, type: "task" },
          ],
        },
      },
    ];

    executeToolCalls(toolCalls, store, [], []);
    const blocks = store.getBlocks().filter((b) => b.date === "2026-03-14");
    const sorted = blocks.sort((a, b) => a.startHour - b.startHour);

    // Verify no two blocks overlap
    for (let i = 0; i < sorted.length - 1; i++) {
      const endOfCurrent = sorted[i].startHour + sorted[i].durationHours;
      expect(sorted[i + 1].startHour).toBeGreaterThanOrEqual(endOfCurrent);
    }
  });

  it("resolves overlapping blocks across a dense AI schedule", () => {
    const store = makeStore();
    // AI puts everything at 8am (worst case)
    const toolCalls: ToolCall[] = [
      {
        name: "generate_schedule",
        arguments: {
          date: "2026-03-14",
          blocks: [
            { title: "Meeting", categoryId: "work", startHour: 8, durationHours: 1, type: "event", isFixed: true },
            { title: "Task 1", categoryId: "work", startHour: 8, durationHours: 0.5, type: "task" },
            { title: "Task 2", categoryId: "work", startHour: 8, durationHours: 0.5, type: "task" },
            { title: "Task 3", categoryId: "work", startHour: 8, durationHours: 1, type: "task" },
            { title: "Lunch", categoryId: "", startHour: 8, durationHours: 0.5, type: "meal" },
          ],
        },
      },
    ];

    executeToolCalls(toolCalls, store, [], []);
    const blocks = store.getBlocks().filter((b) => b.date === "2026-03-14");
    const sorted = blocks.sort((a, b) => a.startHour - b.startHour);

    // Verify no two blocks overlap
    for (let i = 0; i < sorted.length - 1; i++) {
      const endOfCurrent = sorted[i].startHour + sorted[i].durationHours;
      const msg = `Block "${sorted[i].title}" (${sorted[i].startHour}-${endOfCurrent}) overlaps "${sorted[i + 1].title}" (${sorted[i + 1].startHour})`;
      expect(sorted[i + 1].startHour, msg).toBeGreaterThanOrEqual(endOfCurrent - 0.001); // tiny epsilon for float
    }
  });

  it("preserves existing blocks on other dates when scheduling one date", () => {
    const store = makeStore();
    const existingBlocks: TimeBlock[] = [
      block("existing-1", 9, 1, { date: "2026-03-13" }),
      block("existing-2", 10, 1, { date: "2026-03-13" }),
    ];

    const toolCalls: ToolCall[] = [
      {
        name: "generate_schedule",
        arguments: {
          date: "2026-03-14",
          blocks: [
            { title: "New Task", categoryId: "work", startHour: 9, durationHours: 1, type: "task" },
          ],
        },
      },
    ];

    executeToolCalls(toolCalls, store, existingBlocks, []);
    const allBlocks = store.getBlocks();
    const march13 = allBlocks.filter((b) => b.date === "2026-03-13");
    expect(march13).toHaveLength(2); // both preserved
  });

  it("creates tasks AND schedules them without overlaps", () => {
    const store = makeStore();
    const toolCalls: ToolCall[] = [
      {
        name: "create_tasks",
        arguments: {
          tasks: [
            { title: "Alpha", categoryId: "work", priority: 2, estimatedMinutes: 60, preferredTime: "morning", horizon: "today" },
            { title: "Beta", categoryId: "work", priority: 3, estimatedMinutes: 30, preferredTime: "morning", horizon: "today" },
            { title: "Gamma", categoryId: "work", priority: 3, estimatedMinutes: 45, preferredTime: "morning", horizon: "today" },
          ],
        },
      },
      {
        name: "generate_schedule",
        arguments: {
          date: "2026-03-14",
          blocks: [
            { title: "Alpha", categoryId: "work", startHour: 9, durationHours: 1, type: "task", taskId: "alpha-fake" },
            { title: "Beta", categoryId: "work", startHour: 9.5, durationHours: 0.5, type: "task", taskId: "beta-fake" }, // OVERLAPS Alpha!
            { title: "Gamma", categoryId: "work", startHour: 10, durationHours: 0.75, type: "task", taskId: "gamma-fake" },
          ],
        },
      },
    ];

    executeToolCalls(toolCalls, store, [], []);
    const blocks = store.getBlocks().filter((b) => b.date === "2026-03-14");
    const sorted = blocks.sort((a, b) => a.startHour - b.startHour);

    // Verify no overlaps
    for (let i = 0; i < sorted.length - 1; i++) {
      const endOfCurrent = sorted[i].startHour + sorted[i].durationHours;
      const msg = `"${sorted[i].title}" ends at ${endOfCurrent} but "${sorted[i + 1].title}" starts at ${sorted[i + 1].startHour}`;
      expect(sorted[i + 1].startHour, msg).toBeGreaterThanOrEqual(endOfCurrent - 0.001);
    }
  });

  it("auto-schedules unscheduled tasks without overlapping existing blocks", () => {
    const store = makeStore();
    const existingBlocks: TimeBlock[] = [
      block("meeting", 10, 2, { date: "2026-03-14", isFixed: true, type: "event" }),
      block("lunch", 12, 0.5, { date: "2026-03-14", type: "meal" }),
    ];

    // AI creates tasks but doesn't call generate_schedule
    const toolCalls: ToolCall[] = [
      {
        name: "create_tasks",
        arguments: {
          tasks: [
            { title: "Unscheduled 1", categoryId: "work", priority: 2, estimatedMinutes: 60, preferredTime: "any", horizon: "today" },
            { title: "Unscheduled 2", categoryId: "work", priority: 3, estimatedMinutes: 60, preferredTime: "any", horizon: "today" },
          ],
        },
      },
    ];

    executeToolCalls(toolCalls, store, existingBlocks, []);
    const allBlocks = store.getBlocks();
    // Get blocks for the auto-scheduled date
    const dates = [...new Set(allBlocks.map((b) => b.date))];

    for (const date of dates) {
      const dayBlocks = allBlocks.filter((b) => b.date === date);
      const sorted = dayBlocks.sort((a, b) => a.startHour - b.startHour);
      for (let i = 0; i < sorted.length - 1; i++) {
        const endOfCurrent = sorted[i].startHour + sorted[i].durationHours;
        const msg = `[${date}] "${sorted[i].title}" ends at ${endOfCurrent} but "${sorted[i + 1].title}" starts at ${sorted[i + 1].startHour}`;
        expect(sorted[i + 1].startHour, msg).toBeGreaterThanOrEqual(endOfCurrent - 0.001);
      }
    }
  });

  it("skips duplicate tasks that already exist", () => {
    const store = makeStore();
    const existingTasks: Task[] = [
      {
        id: "t-existing",
        title: "Buy groceries",
        categoryId: "life-admin",
        status: "active",
        priority: 3,
        estimatedMinutes: 30,
        canSplit: false,
        notes: "",
        preferredTime: "any",
        energyNeeded: "medium",
        recurring: false,
        createdAt: "2026-03-13",
        rolloverCount: 0,
        horizon: "today",
      },
    ];

    const toolCalls: ToolCall[] = [
      {
        name: "create_tasks",
        arguments: {
          tasks: [
            { title: "Buy groceries", categoryId: "life-admin", priority: 3, estimatedMinutes: 30, preferredTime: "any", horizon: "today" },
            { title: "New unique task", categoryId: "work", priority: 2, estimatedMinutes: 60, preferredTime: "any", horizon: "today" },
          ],
        },
      },
    ];

    const summaries = executeToolCalls(toolCalls, store, [], existingTasks);
    const tasks = store.getTasks();
    expect(tasks).toHaveLength(1); // only the unique one
    expect(tasks[0].title).toBe("New unique task");
    expect(summaries[0]).toContain("1 duplicate");
  });
});
