import { Task, TimeBlock, RecurrenceRule, SchedulingWindow } from "@/types/dayflow";
import { findNextAvailableSlot, isDayAllowed } from "./scheduling-utils";

const ROLLING_WINDOW_DAYS = 14;

/**
 * Generate recurring task instances for the next 14 days.
 * Only creates instances that don't already exist.
 * Returns new tasks and time blocks to add.
 */
export function generateRecurringInstances(
  rules: RecurrenceRule[],
  existingTasks: Task[],
  existingBlocks: TimeBlock[],
  categories: { id: string; schedulingWindow?: SchedulingWindow }[]
): { newTasks: Task[]; newBlocks: TimeBlock[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const newTasks: Task[] = [];
  const newBlocks: TimeBlock[] = [];

  for (const rule of rules) {
    const template = existingTasks.find((t) => t.id === rule.templateTaskId);
    if (!template) continue;

    // Check rule is active
    if (rule.endDate && rule.endDate < today.toISOString().split("T")[0]) continue;

    const dates = getRecurrenceDates(rule, today, ROLLING_WINDOW_DAYS);

    const catWindow = categories.find((c) => c.id === template.categoryId)?.schedulingWindow;

    for (const dateStr of dates) {
      // Skip if this date's day-of-week is not allowed for the category
      if (!isDayAllowed(dateStr, catWindow)) continue;

      // Check if instance already exists for this rule + date
      const alreadyExists = existingTasks.some(
        (t) =>
          t.recurringRuleId === rule.id &&
          t.createdAt === dateStr &&
          t.status !== "dropped"
      ) || newTasks.some(
        (t) =>
          t.recurringRuleId === rule.id &&
          t.createdAt === dateStr
      );

      if (alreadyExists) continue;

      // Also check if a task with the same title already has a block on this date
      // (e.g., AI already scheduled it) — skip to avoid duplicates
      const titleLower = template.title.toLowerCase().trim();
      const hasBlockOnDate = existingBlocks.some(
        (b) => b.date === dateStr && b.title.toLowerCase().trim() === titleLower
      ) || newBlocks.some(
        (b) => b.date === dateStr && b.title.toLowerCase().trim() === titleLower
      );

      if (hasBlockOnDate) continue;

      // Create a new instance
      const instanceId = `t-rec-${rule.id}-${dateStr}`;
      const instance: Task = {
        ...template,
        id: instanceId,
        status: "active",
        recurring: true,
        recurringRuleId: rule.id,
        createdAt: dateStr,
        completedAt: undefined,
        rolloverCount: 0,
        horizon: "today",
        timeBlockId: undefined,
      };
      newTasks.push(instance);

      // Auto-schedule the instance
      const durationHours = (template.estimatedMinutes || 30) / 60;
      const allBlocks = [...existingBlocks, ...newBlocks];
      const startHour = findNextAvailableSlot(
        allBlocks,
        durationHours,
        template.preferredTime,
        dateStr,
        undefined,
        catWindow
      );

      const block: TimeBlock = {
        id: `b-rec-${rule.id}-${dateStr}`,
        taskId: instanceId,
        title: template.title,
        categoryId: template.categoryId,
        date: dateStr,
        startHour,
        durationHours,
        isFixed: false,
        type: "task",
      };
      newBlocks.push(block);
    }
  }

  return { newTasks, newBlocks };
}

/**
 * Get all dates within the rolling window that match a recurrence rule.
 */
function getRecurrenceDates(
  rule: RecurrenceRule,
  today: Date,
  windowDays: number
): string[] {
  const dates: string[] = [];
  const startDate = new Date(rule.startDate + "T00:00:00");
  const endDate = rule.endDate ? new Date(rule.endDate + "T00:00:00") : null;

  for (let i = 0; i < windowDays; i++) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + i);

    // Don't generate before rule start date
    if (candidate < startDate) continue;
    // Don't generate after rule end date
    if (endDate && candidate > endDate) continue;

    const dateStr = candidate.toISOString().split("T")[0];

    if (matchesFrequency(rule, candidate, startDate)) {
      dates.push(dateStr);
    }
  }

  return dates;
}

function matchesFrequency(rule: RecurrenceRule, date: Date, startDate: Date): boolean {
  const dayOfWeek = date.getDay(); // 0=Sun

  switch (rule.frequency) {
    case "daily":
      return true;

    case "weekdays":
      return dayOfWeek >= 1 && dayOfWeek <= 5;

    case "weekly":
      if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        return rule.daysOfWeek.includes(dayOfWeek);
      }
      // Default: same day of week as start date
      return dayOfWeek === startDate.getDay();

    case "biweekly": {
      const daysSinceStart = Math.floor(
        (date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const weeksSinceStart = Math.floor(daysSinceStart / 7);
      if (weeksSinceStart % 2 !== 0) return false;
      if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        return rule.daysOfWeek.includes(dayOfWeek);
      }
      return dayOfWeek === startDate.getDay();
    }

    case "monthly": {
      const startDay = startDate.getDate();
      return date.getDate() === startDay;
    }

    default:
      return false;
  }
}

/**
 * Clean up old recurring instances that are past and completed/dropped.
 * Keeps instances from the last 7 days for reference.
 */
export function cleanupOldRecurringInstances(
  tasks: Task[],
  timeBlocks: TimeBlock[]
): { tasks: Task[]; timeBlocks: TimeBlock[] } {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString().split("T")[0];

  const removedIds = new Set<string>();
  const filteredTasks = tasks.filter((t) => {
    if (!t.recurringRuleId) return true;
    if (t.status === "active") return true;
    // Keep recent completed/dropped instances
    if (t.createdAt >= cutoff) return true;
    removedIds.add(t.id);
    return false;
  });

  const filteredBlocks = timeBlocks.filter(
    (b) => !b.taskId || !removedIds.has(b.taskId)
  );

  return { tasks: filteredTasks, timeBlocks: filteredBlocks };
}
