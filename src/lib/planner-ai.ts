import { Task, TimeBlock, UserPreferences, ChatMessage } from "@/types/dayflow";
import { findNextAvailableSlot, resolveOverlaps, clampToWindow, isDayAllowed } from "@/lib/scheduling-utils";

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
 * Skips dates that fall on disallowed days for the category's scheduling window.
 */
function getAutoScheduleDateForHorizon(
  horizon: string | undefined,
  preferences: { workEndHour?: number; workStartHour?: number },
  dayIndex: number,
  categoryWindow?: import("@/types/dayflow").SchedulingWindow
): string {
  const allDates = getSchedulableDates(preferences, 14); // look ahead further for day filtering
  // Filter to only allowed days for this category
  const dates = categoryWindow?.allowedDays?.length
    ? allDates.filter((d) => isDayAllowed(d, categoryWindow))
    : allDates;
  if (dates.length === 0) return allDates[0]; // fallback if no days allowed

  switch (horizon) {
    case "today":
      return dates[0];
    case "soon":
      return dates[Math.min(dayIndex % 3, dates.length - 1)];
    case "this-week":
      return dates[Math.min(dayIndex % dates.length, dates.length - 1)];
    case "backlog":
      return dates[Math.min(3 + (dayIndex % 4), dates.length - 1)];
    default:
      return dates[Math.min(dayIndex, dates.length - 1)];
  }
}

/**
 * Deduplicate blocks: remove true duplicates only.
 * - Blocks with the same taskId on the same date → keep the latest (prefer one with taskId set)
 * - Blocks with the same title on the same date → keep one (prefer fixed blocks, then blocks with taskId)
 * - Non-task blocks (meals, breaks) at the exact same position → keep one
 */
function deduplicateBlocks(blocks: TimeBlock[]): TimeBlock[] {
  const seenKeys = new Set<string>();
  const result: TimeBlock[] = [];

  // Process in reverse so the LATEST added block wins.
  // Sort priority: fixed blocks first, then blocks with taskId, then the rest.
  const sorted = [...blocks].sort((a, b) => {
    if (a.isFixed && !b.isFixed) return 1;
    if (!a.isFixed && b.isFixed) return -1;
    if (a.taskId && !b.taskId) return 1;
    if (!a.taskId && b.taskId) return -1;
    return 0;
  });

  for (let i = sorted.length - 1; i >= 0; i--) {
    const b = sorted[i];
    if (!b.title || !b.title.trim()) continue;

    // Dedup by taskId + date (blocks for the same task on the same date)
    const taskIdKey = b.taskId ? `task:${b.taskId}:${b.date}` : null;

    // Dedup by title + date regardless of type — prevents fixed event block
    // and flexible task block with the same name from coexisting on the same date
    const titleKey = b.title.toLowerCase().trim();
    const titleDateKey = `title:${titleKey}:${b.date}`;

    // Also dedup by normalized title + date to catch LLM rephrasing
    const normalizedKey = normalizeTitle(b.title);
    const normalizedDateKey = normalizedKey ? `ntitle:${normalizedKey}:${b.date}` : null;

    // Dedup non-task blocks by exact position (same title+date+startHour+type)
    const posKey = b.type !== "task"
      ? `pos:${titleKey}:${b.date}:${b.startHour}:${b.type}`
      : null;

    if (taskIdKey && seenKeys.has(taskIdKey)) continue;
    if (seenKeys.has(titleDateKey)) continue;
    if (normalizedDateKey && seenKeys.has(normalizedDateKey)) continue;
    if (posKey && seenKeys.has(posKey)) continue;

    if (taskIdKey) seenKeys.add(taskIdKey);
    seenKeys.add(titleDateKey);
    if (normalizedDateKey) seenKeys.add(normalizedDateKey);
    if (posKey) seenKeys.add(posKey);
    result.push(b);
  }

  return result.reverse();
}

/**
 * Normalize a title for matching: lowercase, strip parenthetical suffixes,
 * normalize "&" to "and", collapse whitespace, strip trailing punctuation.
 * Handles the common ways GPT-4o rephrases titles across tool calls.
 */
function normalizeTitle(raw: string): string {
  let t = raw.toLowerCase().trim();
  // Strip parenthetical suffixes like "(30 min)", "(1 hr)", "(task)"
  t = t.replace(/\s*\([^)]*\)\s*$/, "");
  // Normalize "&" to "and"
  t = t.replace(/\s*&\s*/g, " and ");
  // Collapse multiple spaces
  t = t.replace(/\s+/g, " ");
  // Strip trailing punctuation
  t = t.replace(/[.,;:!?]+$/, "");
  return t.trim();
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
  // Track all blocks across all dates — single source of truth, committed once at end
  let allBlocks = [...existingTimeBlocks];
  // Track which dates were fully replaced by generate_schedule
  const scheduledDates = new Set<string>();
  // Track whether any block-level changes happened (to know if we need to commit)
  let blocksChanged = false;

  for (const tc of toolCalls) {
    switch (tc.name) {
      case "create_tasks": {
        // Build set of existing task titles for dedup — include active tasks,
        // recurring templates, and recurring instances to prevent duplicates
        const existingTitles = new Set(
          existingTasks
            .filter((t) => t.status === "active" || t.recurring)
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
        blocksChanged = true;

        // Filter AI blocks: skip empty titles and past blocks for today
        const aiBlocks: any[] = tc.arguments.blocks
          .filter((b: any) => b.title && b.title.trim())
          .filter((b: any) => {
            if (targetDate === today && b.startHour + (b.durationHours || 0.5) <= currentHour) {
              return false;
            }
            return true;
          });

        // Track which existing block IDs the AI "claimed" (moved/updated)
        const claimedBlockIds = new Set<string>();

        for (let i = 0; i < aiBlocks.length; i++) {
          const ab = aiBlocks[i];
          const aiTitle = (ab.title || "").toLowerCase().trim();
          const aiTitleNormalized = normalizeTitle(ab.title || "");
          const aiType = ab.type || "task";
          const timeClamp = targetDate === today
            ? Math.max(ab.startHour, Math.ceil(currentHour * 4) / 4)
            : ab.startHour;
          // Clamp to category scheduling window so AI blocks stay within user-set hours
          const blockCatId = ab.categoryId || "";
          const blockCatWindow = store.preferences?.categories?.find((c) => c.id === blockCatId)?.schedulingWindow;
          const clampedStart = ab.isFixed ? timeClamp : clampToWindow(timeClamp, ab.durationHours || 0.5, blockCatWindow);

          // Search ALL days for an existing block matching this AI block
          // Priority: match by taskId first, then exact title, then normalized title
          let existing: TimeBlock | undefined;
          if (ab.taskId) {
            existing = allBlocks.find(
              (b) => b.taskId === ab.taskId && !claimedBlockIds.has(b.id)
            );
          }
          if (!existing) {
            existing = allBlocks.find(
              (b) =>
                b.title.toLowerCase().trim() === aiTitle &&
                !claimedBlockIds.has(b.id)
            );
          }
          if (!existing) {
            existing = allBlocks.find(
              (b) =>
                normalizeTitle(b.title) === aiTitleNormalized &&
                aiTitleNormalized.length > 0 &&
                !claimedBlockIds.has(b.id)
            );
          }

          if (existing) {
            // Found an existing block for this task
            if (existing.isFixed) {
              // Don't move fixed blocks — claim it so it's not orphaned
              claimedBlockIds.add(existing.id);
              continue;
            }
            // Move/update the existing block in place (preserves its ID)
            const idx = allBlocks.findIndex((b) => b.id === existing!.id);
            if (idx !== -1) {
              allBlocks[idx] = {
                ...allBlocks[idx],
                date: targetDate,
                startHour: clampedStart,
                durationHours: ab.durationHours,
                categoryId: ab.categoryId || allBlocks[idx].categoryId,
              };
            }
            claimedBlockIds.add(existing.id);
          } else {
            // No existing block found — create a new one
            const newBlock: TimeBlock = {
              id: `b-${Date.now()}-${i}`,
              title: ab.title,
              categoryId: ab.categoryId || "",
              date: targetDate,
              startHour: clampedStart,
              durationHours: ab.durationHours,
              isFixed: ab.isFixed || false,
              type: aiType,
              taskId: ab.taskId,
            };
            allBlocks.push(newBlock);
            claimedBlockIds.add(newBlock.id);
          }
        }

        // Remove orphaned non-fixed blocks on the target date that the AI didn't mention
        // (these are blocks the AI decided shouldn't be scheduled today)
        allBlocks = allBlocks.filter((b) => {
          if (b.date !== targetDate) return true; // different date — keep
          if (claimedBlockIds.has(b.id)) return true; // AI mentioned it — keep
          if (b.isFixed) return true; // fixed block — keep
          if (b.type === "meal") return true; // meal blocks managed separately — keep
          return false; // orphaned non-fixed block — remove
        });

        // Resolve overlaps: fixed blocks first, then flex blocks
        const cats = store.preferences?.categories;
        const dateBlocks = allBlocks.filter((b) => b.date === targetDate);
        const fixedOnDate = dateBlocks.filter((b) => b.isFixed);
        const flexOnDate = dateBlocks.filter((b) => !b.isFixed);
        for (const block of fixedOnDate) {
          allBlocks = resolveOverlaps(allBlocks, block.id, 1, cats);
        }
        for (const block of flexOnDate) {
          const dayBlocks = allBlocks.filter((b) => b.date === targetDate && b.id !== block.id);
          const hasConflict = dayBlocks.some(
            (b) => block.startHour < b.startHour + b.durationHours && block.startHour + block.durationHours > b.startHour
          );
          if (hasConflict) {
            const flexCatWindow = cats?.find((c) => c.id === block.categoryId)?.schedulingWindow;
            const newStart = findNextAvailableSlot(
              dayBlocks,
              block.durationHours,
              "any",
              targetDate,
              block.startHour,
              flexCatWindow
            );
            const idx = allBlocks.findIndex((b) => b.id === block.id);
            if (idx !== -1) {
              allBlocks[idx] = { ...allBlocks[idx], startHour: newStart };
            }
          }
        }

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
        blocksChanged = true;
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
        allBlocks.push(block);
        allBlocks = resolveOverlaps(allBlocks, block.id, 1, store.preferences?.categories);
        summaries.push(`Added ${tc.arguments.type || "break"}`);
        break;
      }
      case "move_blocks_to_date": {
        const moves: { blockId: string; targetDate: string }[] = tc.arguments.moves;
        let movedCount = 0;
        for (const move of moves) {
          const idx = allBlocks.findIndex((b) => b.id === move.blockId);
          if (idx === -1) continue;

          const block = allBlocks[idx];
          // Skip if already on the target date
          if (block.date === move.targetDate) continue;

          // Skip if a block with the same task/title already exists on target date
          // (generate_schedule may have already created it there)
          const blockNormalized = normalizeTitle(block.title);
          const alreadyOnTarget = allBlocks.some((b) =>
            b.date === move.targetDate &&
            b.id !== block.id &&
            (
              (b.taskId && b.taskId === block.taskId) ||
              (b.title.toLowerCase().trim() === block.title.toLowerCase().trim() && b.type === block.type) ||
              (blockNormalized.length > 0 && normalizeTitle(b.title) === blockNormalized && b.type === block.type)
            )
          );
          if (alreadyOnTarget) continue;

          allBlocks[idx] = { ...block, date: move.targetDate };
          allBlocks = resolveOverlaps(allBlocks, block.id, 1, store.preferences?.categories);
          blocksChanged = true;
          movedCount++;
        }
        summaries.push(`Moved ${movedCount} block${movedCount !== 1 ? "s" : ""}`);
        break;
      }
    }
  }

  // Reconcile task IDs: if AI called both create_tasks and generate_schedule,
  // the schedule blocks may reference AI-invented IDs or have undefined taskId.
  // Match blocks to created tasks using normalized titles to handle LLM rephrasing
  // (e.g. "and" vs "&", added parentheticals like "(30 min)").
  if (createdTasks.length > 0 && hasScheduleCall) {
    // Build lookup maps: exact title → task, normalized title → task
    const exactTitleToTask = new Map<string, Task>();
    const normalizedTitleToTask = new Map<string, Task>();
    for (const task of createdTasks) {
      exactTitleToTask.set(task.title.toLowerCase().trim(), task);
      normalizedTitleToTask.set(normalizeTitle(task.title), task);
    }

    for (const block of allBlocks) {
      // Try exact match first, then normalized match
      const matchedTask =
        exactTitleToTask.get(block.title.toLowerCase().trim()) ||
        normalizedTitleToTask.get(normalizeTitle(block.title));
      if (!matchedTask) continue;

      // Block already has the correct real taskId — skip
      if (block.taskId === matchedTask.id) continue;

      // Block has no taskId, or has an AI-invented one — fix it
      block.taskId = matchedTask.id;
      block.categoryId = matchedTask.categoryId;
    }

    // Find created tasks that still don't have a schedule block after reconciliation.
    // Check by taskId, exact title, AND normalized title to avoid false positives.
    const scheduledIds = new Set(allBlocks.filter((b) => b.taskId).map((b) => b.taskId));
    const scheduledTitlesExact = new Set(
      allBlocks.map((b) => b.title.toLowerCase().trim())
    );
    const scheduledTitlesNormalized = new Set(
      allBlocks.map((b) => normalizeTitle(b.title))
    );
    const unscheduled = createdTasks.filter(
      (t) =>
        !scheduledIds.has(t.id) &&
        !scheduledTitlesExact.has(t.title.toLowerCase().trim()) &&
        !scheduledTitlesNormalized.has(normalizeTitle(t.title))
    );
    const prefs = store.preferences || {};
    let dayIndex = 0;
    for (const task of unscheduled) {
      if (task.horizon === "backlog") continue;
      const catWindow = store.preferences?.categories?.find((c) => c.id === task.categoryId)?.schedulingWindow;
      const targetDate = getAutoScheduleDateForHorizon(task.horizon, prefs, dayIndex, catWindow);
      const isToday = targetDate === today;
      const minHour = isToday ? currentHour : undefined;
      const durationHours = (task.estimatedMinutes || 30) / 60;
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
    blocksChanged = true;
  }

  // Auto-schedule created tasks if AI didn't call generate_schedule
  if (createdTasks.length > 0 && !hasScheduleCall) {
    const schedulableTasks = createdTasks.filter((t) => t.horizon !== "backlog");
    const prefs2 = store.preferences || {};
    let dayIdx = 0;

    for (const task of schedulableTasks) {
      const catWindow2 = store.preferences?.categories?.find((c) => c.id === task.categoryId)?.schedulingWindow;
      const targetDate = getAutoScheduleDateForHorizon(task.horizon, prefs2, dayIdx, catWindow2);
      const isToday = targetDate === today;
      const minHour = isToday ? currentHour : undefined;
      const durationHours = (task.estimatedMinutes || 30) / 60;
      const startHour = findNextAvailableSlot(
        allBlocks,
        durationHours,
        task.preferredTime,
        targetDate,
        minHour,
        catWindow2
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
      dayIdx++;
    }
    blocksChanged = true;
  }

  // Final dedup and commit — single store update for all block changes
  if (blocksChanged) {
    allBlocks = deduplicateBlocks(allBlocks);
    store.setTimeBlocks(allBlocks);
  }

  return summaries;
}
