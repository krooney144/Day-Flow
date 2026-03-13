import { Task, TimeBlock, UserPreferences, ChatMessage } from "@/types/dayflow";
import { findNextAvailableSlot, resolveOverlaps } from "@/lib/scheduling-utils";

const CHAT_URL = "/api/planner-chat";

interface PlannerContext {
  messages: { role: "user" | "assistant"; content: string }[];
  currentTasks: Task[];
  preferences: UserPreferences;
  timeBlocks: TimeBlock[];
  customProjects?: Record<string, string[]>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

interface PlannerResponse {
  content: string;
  toolCalls: ToolCall[];
}

export async function callPlannerAI(context: PlannerContext): Promise<PlannerResponse> {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(context),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `AI request failed (${resp.status})`);
  }

  return resp.json();
}

// findNextAvailableSlot is now imported from scheduling-utils.ts

/**
 * Get the next N schedulable dates starting from today/tomorrow.
 * If past work hours, starts from tomorrow.
 */
function getSchedulableDates(preferences: { workEndHour?: number; workStartHour?: number }, count: number = 7): string[] {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const workEnd = preferences.workEndHour ?? 18;

  const dates: string[] = [];
  // If past work hours, start from tomorrow; otherwise include today
  const startOffset = currentHour >= workEnd ? 1 : 0;
  for (let i = startOffset; i < startOffset + count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

/**
 * Determine the best date to auto-schedule a task on based on its horizon.
 */
function getAutoScheduleDateForHorizon(
  horizon: string | undefined,
  preferences: { workEndHour?: number; workStartHour?: number },
  dayIndex: number
): string {
  const dates = getSchedulableDates(preferences);
  switch (horizon) {
    case "today":
      return dates[0]; // Today or tomorrow if past work hours
    case "soon":
      return dates[Math.min(dayIndex % 3, dates.length - 1)]; // Spread across next 2-3 days
    case "this-week":
      return dates[Math.min(dayIndex % dates.length, dates.length - 1)]; // Spread across the week
    case "backlog":
      return dates[Math.min(3 + (dayIndex % 4), dates.length - 1)]; // Later in the week
    default:
      return dates[Math.min(dayIndex, dates.length - 1)]; // Default: spread
  }
}

export function executeToolCalls(
  toolCalls: ToolCall[],
  store: {
    addTasks: (tasks: Task[]) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    toggleTaskComplete: (id: string) => void;
    dropTask: (id: string) => void;
    deferTask: (id: string) => void;
    setTimeBlocks: (blocks: TimeBlock[]) => void;
    addTimeBlock: (block: TimeBlock) => void;
    addTimeBlocks: (blocks: TimeBlock[]) => void;
    updatePreferences: (prefs: Partial<UserPreferences>) => void;
    addProject: (categoryId: string, projectName: string) => void;
    moveBlockToDate: (blockId: string, newDate: string) => void;
    preferences?: UserPreferences;
  },
  existingTimeBlocks: TimeBlock[] = [],
  existingTasks: Task[] = []
): string[] {
  const summaries: string[] = [];
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const hasScheduleCall = toolCalls.some((tc) => tc.name === "generate_schedule");
  let createdTasks: Task[] = [];
  // Track all blocks across all dates
  let allBlocks = [...existingTimeBlocks];
  // Track which dates were scheduled by AI (to know which dates got replaced)
  const scheduledDates = new Set<string>();

  for (const tc of toolCalls) {
    switch (tc.name) {
      case "create_tasks": {
        // Build set of existing active task titles for dedup
        const existingTitles = new Set(
          existingTasks
            .filter((t) => t.status === "active")
            .map((t) => t.title.toLowerCase().trim())
        );

        const tasks: Task[] = tc.arguments.tasks
          .filter((t: any) => !existingTitles.has(t.title.toLowerCase().trim()))
          .map((t: any, i: number) => ({
            id: `t-${Date.now()}-${i}`,
            title: t.title,
            categoryId: t.categoryId || "life-admin",
            project: t.project || undefined,
            status: "active" as const,
            priority: t.priority || 3,
            estimatedMinutes: t.estimatedMinutes || 30,
            canSplit: (t.estimatedMinutes || 30) > 60,
            notes: t.notes || "",
            preferredTime: t.preferredTime || "any",
            energyNeeded: (t.priority || 3) <= 2 ? ("high" as const) : ("medium" as const),
            recurring: false,
            createdAt: today,
            rolloverCount: 0,
            horizon: t.horizon || "today",
            deadline: t.deadline || undefined,
          }));
        const skippedCount = tc.arguments.tasks.length - tasks.length;
        if (tasks.length > 0) {
          store.addTasks(tasks);
        }
        createdTasks = tasks;
        let summary = `Added ${tasks.length} task${tasks.length !== 1 ? "s" : ""}`;
        if (skippedCount > 0) {
          summary += ` (${skippedCount} duplicate${skippedCount !== 1 ? "s" : ""} skipped)`;
        }
        summaries.push(summary);
        break;
      }
      case "update_task": {
        const { taskId, ...updates } = tc.arguments;
        store.updateTask(taskId, updates);
        summaries.push("Updated task");
        break;
      }
      case "complete_task": {
        store.toggleTaskComplete(tc.arguments.taskId);
        summaries.push("Completed task");
        break;
      }
      case "defer_task": {
        store.deferTask(tc.arguments.taskId);
        summaries.push("Deferred task");
        break;
      }
      case "drop_task": {
        store.dropTask(tc.arguments.taskId);
        summaries.push("Dropped task");
        break;
      }
      case "reprioritize_tasks": {
        for (const t of tc.arguments.tasks) {
          store.updateTask(t.taskId, { priority: t.priority });
        }
        summaries.push(`Reprioritized ${tc.arguments.tasks.length} tasks`);
        break;
      }
      case "generate_schedule": {
        const targetDate = tc.arguments.date || today;
        scheduledDates.add(targetDate);

        const newBlocks: TimeBlock[] = tc.arguments.blocks.map((b: any, i: number) => ({
          id: `b-${Date.now()}-${i}`,
          title: b.title,
          categoryId: b.categoryId || "",
          date: targetDate,
          startHour: b.startHour,
          durationHours: b.durationHours,
          isFixed: b.isFixed || false,
          type: b.type || "task",
          taskId: b.taskId,
        }));

        // Merge: keep blocks for OTHER dates, replace blocks for THIS date
        allBlocks = [
          ...allBlocks.filter((b) => b.date !== targetDate),
          ...newBlocks,
        ];

        // Resolve ALL overlaps within the generated schedule, not just fixed blocks.
        // Process fixed blocks first (they take priority), then resolve any remaining overlaps.
        const fixedBlocks = newBlocks.filter((b) => b.isFixed);
        const flexBlocks = newBlocks.filter((b) => !b.isFixed);
        for (const block of fixedBlocks) {
          allBlocks = resolveOverlaps(allBlocks, block.id);
        }
        // For non-fixed blocks, check for overlaps and shift them if needed
        for (const block of flexBlocks) {
          const dayBlocks = allBlocks.filter((b) => b.date === targetDate && b.id !== block.id);
          const hasConflict = dayBlocks.some(
            (b) => block.startHour < b.startHour + b.durationHours && block.startHour + block.durationHours > b.startHour
          );
          if (hasConflict) {
            const newStart = findNextAvailableSlot(
              dayBlocks,
              block.durationHours,
              "any",
              targetDate,
              block.startHour
            );
            const idx = allBlocks.findIndex((b) => b.id === block.id);
            if (idx !== -1) {
              allBlocks[idx] = { ...allBlocks[idx], startHour: newStart };
            }
          }
        }

        store.setTimeBlocks(allBlocks);
        const dateLabel = targetDate === today ? "today" : targetDate;
        summaries.push(`Generated schedule for ${dateLabel}`);
        break;
      }
      case "update_preferences": {
        store.updatePreferences(tc.arguments);
        summaries.push("Updated preferences");
        break;
      }
      case "create_project": {
        store.addProject(tc.arguments.categoryId, tc.arguments.projectName);
        summaries.push(`Created project "${tc.arguments.projectName}"`);
        break;
      }
      case "add_buffer_block": {
        const block: TimeBlock = {
          id: `b-${Date.now()}`,
          title: tc.arguments.title,
          categoryId: "",
          date: tc.arguments.date || today,
          startHour: tc.arguments.startHour,
          durationHours: tc.arguments.durationHours,
          isFixed: false,
          type: tc.arguments.type || "break",
        };
        store.addTimeBlock(block);
        allBlocks.push(block);
        summaries.push(`Added ${tc.arguments.type || "break"}`);
        break;
      }
      case "move_blocks_to_date": {
        const moves: { blockId: string; targetDate: string }[] = tc.arguments.moves;
        for (const move of moves) {
          store.moveBlockToDate(move.blockId, move.targetDate);
          // Update allBlocks tracking
          const idx = allBlocks.findIndex((b) => b.id === move.blockId);
          if (idx !== -1) {
            allBlocks[idx] = { ...allBlocks[idx], date: move.targetDate };
          }
        }
        summaries.push(`Moved ${moves.length} block${moves.length > 1 ? "s" : ""}`);
        break;
      }
    }
  }

  // Reconcile task IDs: if AI called both create_tasks and generate_schedule,
  // the schedule blocks may reference AI-invented IDs instead of real ones.
  if (createdTasks.length > 0 && hasScheduleCall) {
    const titleToId = new Map<string, Task>();
    for (const task of createdTasks) {
      titleToId.set(task.title.toLowerCase().trim(), task);
    }

    for (const block of allBlocks) {
      if (!block.taskId) continue;
      const isReal = createdTasks.some((t) => t.id === block.taskId);
      if (isReal) continue;
      const matchedTask = titleToId.get(block.title.toLowerCase().trim());
      if (matchedTask) {
        block.taskId = matchedTask.id;
        block.categoryId = matchedTask.categoryId;
      }
    }

    // Find created tasks missing a schedule block, auto-schedule them across multiple days
    const scheduledIds = new Set(allBlocks.filter((b) => b.taskId).map((b) => b.taskId));
    const unscheduled = createdTasks.filter((t) => !scheduledIds.has(t.id));
    // Group by horizon and spread across days
    const prefs = store.preferences || {};
    let dayIndex = 0;
    for (const task of unscheduled) {
      if (task.horizon === "backlog") continue; // Don't auto-schedule backlog tasks
      const targetDate = getAutoScheduleDateForHorizon(task.horizon, prefs, dayIndex);
      const isToday = targetDate === today;
      const minHour = isToday ? currentHour : undefined;
      const durationHours = (task.estimatedMinutes || 30) / 60;
      const catWindow = store.preferences?.categories?.find((c) => c.id === task.categoryId)?.schedulingWindow;
      const startHour = findNextAvailableSlot(
        allBlocks,
        durationHours,
        task.preferredTime,
        targetDate,
        minHour,
        catWindow
      );
      allBlocks.push({
        id: `b-auto-${task.id}`,
        taskId: task.id,
        title: task.title,
        categoryId: task.categoryId,
        date: targetDate,
        startHour,
        durationHours,
        isFixed: false,
        type: "task",
      });
      dayIndex++;
    }

    store.setTimeBlocks(allBlocks);
    if (unscheduled.length > 0) {
      summaries.push(`Auto-scheduled ${unscheduled.length} missed task${unscheduled.length > 1 ? "s" : ""}`);
    }
  }

  // Auto-schedule created tasks if AI didn't call generate_schedule
  if (createdTasks.length > 0 && !hasScheduleCall) {
    // Schedule all tasks except backlog across multiple days
    const schedulableTasks = createdTasks.filter((t) => t.horizon !== "backlog");
    const autoBlocks: TimeBlock[] = [];
    const prefs2 = store.preferences || {};
    let dayIdx = 0;

    for (const task of schedulableTasks) {
      const targetDate = getAutoScheduleDateForHorizon(task.horizon, prefs2, dayIdx);
      const isToday = targetDate === today;
      const minHour = isToday ? currentHour : undefined;
      const durationHours = (task.estimatedMinutes || 30) / 60;
      const catWindow2 = store.preferences?.categories?.find((c) => c.id === task.categoryId)?.schedulingWindow;
      const startHour = findNextAvailableSlot(
        [...allBlocks, ...autoBlocks],
        durationHours,
        task.preferredTime,
        targetDate,
        minHour,
        catWindow2
      );
      const block: TimeBlock = {
        id: `b-auto-${task.id}`,
        taskId: task.id,
        title: task.title,
        categoryId: task.categoryId,
        date: targetDate,
        startHour,
        durationHours,
        isFixed: false,
        type: "task",
      };
      autoBlocks.push(block);
      dayIdx++;
    }
    if (autoBlocks.length > 0) {
      store.addTimeBlocks(autoBlocks);
      const dateSet = new Set(autoBlocks.map((b) => b.date));
      summaries.push(`Auto-scheduled ${autoBlocks.length} task${autoBlocks.length > 1 ? "s" : ""} across ${dateSet.size} day${dateSet.size > 1 ? "s" : ""}`);
    }
  }

  return summaries;
}
