import { useEffect, useRef } from "react";
import { useDayFlow } from "@/context/DayFlowContext";
import { findNextAvailableSlot } from "@/lib/scheduling-utils";
import { TimeBlock } from "@/types/dayflow";

/**
 * Normalize a title for matching — mirrors the normalizeTitle in planner-ai.ts.
 * Handles "&" vs "and", parenthetical suffixes, whitespace, punctuation.
 */
function normalizeTitle(raw: string): string {
  let t = raw.toLowerCase().trim();
  t = t.replace(/\s*\([^)]*\)\s*$/, "");
  t = t.replace(/\s*&\s*/g, " and ");
  t = t.replace(/\s+/g, " ");
  t = t.replace(/[.,;:!?]+$/, "");
  return t.trim();
}

/**
 * One-shot failsafe: on mount, find any active tasks missing a schedule block
 * and auto-create blocks for them. Runs ONCE (not reactively) to avoid
 * render cascades from updating timeBlocks inside an effect that depends on
 * timeBlocks.
 */
export function useTaskScheduleSync() {
  const { tasks, timeBlocks, addTimeBlocks, preferences } = useDayFlow();
  const hasRun = useRef(false);

  useEffect(() => {
    // Only run once per mount — the auto-scheduling fallback in executeToolCalls
    // handles the AI path; this is just a safety net for app startup.
    if (hasRun.current) return;
    hasRun.current = true;

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
    const scheduledTitlesExact = new Set(
      timeBlocks.map((b) => b.title.toLowerCase().trim())
    );
    const scheduledTitlesNormalized = new Set(
      timeBlocks.map((b) => normalizeTitle(b.title))
    );

    const orphaned = activeTasks.filter((t) => {
      if (scheduledTaskIds.has(t.id)) return false;
      if (scheduledTitlesExact.has(t.title.toLowerCase().trim())) return false;
      if (scheduledTitlesNormalized.has(normalizeTitle(t.title))) return false;
      return true;
    });
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
