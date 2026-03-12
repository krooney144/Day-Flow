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
 * Determine the best date to auto-schedule a task on.
 * If past work hours, defaults to tomorrow; otherwise today.
 */
function getAutoScheduleDate(preferences: { workEndHour?: number }): string {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const workEnd = preferences.workEndHour ?? 18;

  if (currentHour >= workEnd) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }
  return now.toISOString().split("T")[0];
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
  existingTimeBlocks: TimeBlock[] = []
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
        const tasks: Task[] = tc.arguments.tasks.map((t: any, i: number) => ({
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
        store.addTasks(tasks);
        createdTasks = tasks;
        summaries.push(`Added ${tasks.length} task${tasks.length > 1 ? "s" : ""}`);
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

        // Resolve any overlaps within the generated schedule
        for (const block of newBlocks) {
          if (block.isFixed) {
            allBlocks = resolveOverlaps(allBlocks, block.id);
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

    // Find created tasks missing a schedule block, auto-schedule them
    const scheduledIds = new Set(allBlocks.filter((b) => b.taskId).map((b) => b.taskId));
    const unscheduled = createdTasks.filter((t) => !scheduledIds.has(t.id));
    for (const task of unscheduled) {
      // Pick the best date: use a scheduled date if available, otherwise auto-detect
      const targetDate = scheduledDates.size > 0
        ? [...scheduledDates][0]
        : getAutoScheduleDate(store.preferences || {});
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
    }

    store.setTimeBlocks(allBlocks);
    if (unscheduled.length > 0) {
      summaries.push(`Auto-scheduled ${unscheduled.length} missed task${unscheduled.length > 1 ? "s" : ""}`);
    }
  }

  // Auto-schedule created tasks if AI didn't call generate_schedule
  if (createdTasks.length > 0 && !hasScheduleCall) {
    const schedulableTasks = createdTasks.filter((t) => t.horizon === "today" || t.horizon === "soon" || !t.horizon);
    const autoBlocks: TimeBlock[] = [];

    for (const task of schedulableTasks) {
      // If past work hours, schedule for tomorrow; otherwise today
      const targetDate = getAutoScheduleDate(store.preferences || {});
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
    }
    if (autoBlocks.length > 0) {
      store.addTimeBlocks(autoBlocks);
      summaries.push(`Auto-scheduled ${autoBlocks.length} task${autoBlocks.length > 1 ? "s" : ""}`);
    }
  }

  return summaries;
}
