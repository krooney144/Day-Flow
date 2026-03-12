import { Task, TimeBlock, UserPreferences, ChatMessage } from "@/types/dayflow";
import { findNextAvailableSlot } from "@/lib/scheduling-utils";

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
  },
  existingTimeBlocks: TimeBlock[] = []
): string[] {
  const summaries: string[] = [];
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const hasScheduleCall = toolCalls.some((tc) => tc.name === "generate_schedule");
  let createdTasks: Task[] = [];
  let allBlocks = [...existingTimeBlocks];

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
        const blocks: TimeBlock[] = tc.arguments.blocks.map((b: any, i: number) => ({
          id: `b-${Date.now()}-${i}`,
          title: b.title,
          categoryId: b.categoryId || "",
          date: tc.arguments.date || today,
          startHour: b.startHour,
          durationHours: b.durationHours,
          isFixed: b.isFixed || false,
          type: b.type || "task",
          taskId: b.taskId,
        }));
        store.setTimeBlocks(blocks);
        allBlocks = blocks;
        summaries.push("Generated schedule");
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
    }
  }

  // Reconcile task IDs: if AI called both create_tasks and generate_schedule,
  // the schedule blocks may reference AI-invented IDs instead of real ones.
  if (createdTasks.length > 0 && hasScheduleCall) {
    // Build title → real ID map
    const titleToId = new Map<string, Task>();
    for (const task of createdTasks) {
      titleToId.set(task.title.toLowerCase().trim(), task);
    }

    // Patch schedule blocks with correct taskIds by matching on title
    for (const block of allBlocks) {
      if (!block.taskId) continue;
      // Check if the taskId is a real one (matches a created task)
      const isReal = createdTasks.some((t) => t.id === block.taskId);
      if (isReal) continue;
      // Try to match by title
      const matchedTask = titleToId.get(block.title.toLowerCase().trim());
      if (matchedTask) {
        block.taskId = matchedTask.id;
        block.categoryId = matchedTask.categoryId;
      }
    }

    // Find any created tasks still missing a schedule block
    const scheduledIds = new Set(allBlocks.filter((b) => b.taskId).map((b) => b.taskId));
    const unscheduled = createdTasks.filter((t) => !scheduledIds.has(t.id));
    for (const task of unscheduled) {
      const durationHours = (task.estimatedMinutes || 30) / 60;
      const startHour = findNextAvailableSlot(
        allBlocks,
        durationHours,
        task.preferredTime,
        today,
        currentHour
      );
      allBlocks.push({
        id: `b-auto-${task.id}`,
        taskId: task.id,
        title: task.title,
        categoryId: task.categoryId,
        date: today,
        startHour,
        durationHours,
        isFixed: false,
        type: "task",
      });
    }

    // Re-set all blocks with corrected data
    store.setTimeBlocks(allBlocks);
    if (unscheduled.length > 0) {
      summaries.push(`Auto-scheduled ${unscheduled.length} missed task${unscheduled.length > 1 ? "s" : ""}`);
    }
  }

  // Auto-schedule created tasks if AI didn't call generate_schedule — only "today" horizon
  if (createdTasks.length > 0 && !hasScheduleCall) {
    const todayTasks = createdTasks.filter((t) => t.horizon === "today" || !t.horizon);
    const autoBlocks: TimeBlock[] = [];
    for (const task of todayTasks) {
      const durationHours = (task.estimatedMinutes || 30) / 60;
      const startHour = findNextAvailableSlot(
        [...allBlocks, ...autoBlocks],
        durationHours,
        task.preferredTime,
        today,
        currentHour
      );
      const block: TimeBlock = {
        id: `b-auto-${task.id}`,
        taskId: task.id,
        title: task.title,
        categoryId: task.categoryId,
        date: today,
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
