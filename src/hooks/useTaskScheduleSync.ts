import { useEffect } from "react";
import { useDayFlow } from "@/context/DayFlowContext";
import { findNextAvailableSlot } from "@/lib/scheduling-utils";
import { TimeBlock } from "@/types/dayflow";

/**
 * Failsafe: on mount, find any active tasks with horizon "today" or "soon"
 * missing a schedule block and auto-create blocks for them.
 * Spreads tasks across appropriate days based on horizon.
 */
export function useTaskScheduleSync() {
  const { tasks, timeBlocks, addTimeBlocks, preferences } = useDayFlow();

  useEffect(() => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const workEnd = preferences.workEndHour ?? 18;
    const isPastWorkHours = currentHour >= workEnd;

    const activeTasks = tasks.filter(
      (t) => t.status === "active" && t.horizon !== "backlog"
    );
    const scheduledTaskIds = new Set(
      timeBlocks.filter((b) => b.taskId).map((b) => b.taskId)
    );
    // Also track scheduled titles to catch blocks where AI omitted taskId
    const scheduledTitles = new Set(
      timeBlocks
        .filter((b) => b.type === "task")
        .map((b) => b.title.toLowerCase().trim())
    );

    const orphaned = activeTasks.filter(
      (t) => !scheduledTaskIds.has(t.id) && !scheduledTitles.has(t.title.toLowerCase().trim())
    );
    if (orphaned.length === 0) return;

    // Build list of schedulable dates
    const dates: string[] = [];
    const startOffset = isPastWorkHours ? 1 : 0;
    for (let i = startOffset; i < startOffset + 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }

    const newBlocks: TimeBlock[] = [];
    let dayIndex = 0;
    for (const task of orphaned) {
      const durationHours = (task.estimatedMinutes || 30) / 60;
      const category = preferences.categories.find((c) => c.id === task.categoryId);

      // Pick date based on horizon
      let targetDate: string;
      switch (task.horizon) {
        case "today":
          targetDate = dates[0];
          break;
        case "soon":
          targetDate = dates[Math.min(dayIndex % 3, dates.length - 1)];
          break;
        case "this-week":
          targetDate = dates[Math.min(dayIndex % dates.length, dates.length - 1)];
          break;
        default:
          targetDate = dates[Math.min(dayIndex, dates.length - 1)];
      }

      const isTargetToday = targetDate === today;
      const minHour = isTargetToday ? currentHour : undefined;
      const startHour = findNextAvailableSlot(
        [...timeBlocks, ...newBlocks],
        durationHours,
        task.preferredTime,
        targetDate,
        minHour,
        category?.schedulingWindow
      );
      newBlocks.push({
        id: `b-sync-${task.id}`,
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

    addTimeBlocks(newBlocks);
  }, [tasks, timeBlocks, addTimeBlocks, preferences]);
}
