import { useEffect } from "react";
import { useDayFlow } from "@/context/DayFlowContext";
import { findNextAvailableSlot } from "@/lib/scheduling-utils";
import { TimeBlock } from "@/types/dayflow";

/**
 * Failsafe: on mount, find any active "today" tasks missing a schedule block
 * and auto-create blocks for them. Only syncs tasks with horizon === "today".
 */
export function useTaskScheduleSync() {
  const { tasks, timeBlocks, addTimeBlocks, preferences } = useDayFlow();

  useEffect(() => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHour = now.getHours() + now.getMinutes() / 60;

    const activeTasks = tasks.filter(
      (t) => t.status === "active" && (t.horizon === "today" || !t.horizon)
    );
    const scheduledTaskIds = new Set(
      timeBlocks.filter((b) => b.taskId).map((b) => b.taskId)
    );

    const orphaned = activeTasks.filter((t) => !scheduledTaskIds.has(t.id));
    if (orphaned.length === 0) return;

    const newBlocks: TimeBlock[] = [];
    for (const task of orphaned) {
      const durationHours = (task.estimatedMinutes || 30) / 60;
      const category = preferences.categories.find((c) => c.id === task.categoryId);
      const startHour = findNextAvailableSlot(
        [...timeBlocks, ...newBlocks],
        durationHours,
        task.preferredTime,
        today,
        currentHour,
        category?.schedulingWindow
      );
      newBlocks.push({
        id: `b-sync-${task.id}`,
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

    addTimeBlocks(newBlocks);
  }, [tasks, timeBlocks, addTimeBlocks]);
}
