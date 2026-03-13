// DayFlow store — localStorage + Supabase-backed state management
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Task,
  TimeBlock,
  ChatMessage,
  UserPreferences,
  DEFAULT_CATEGORIES,
  Category,
  RecurrenceRule,
} from "@/types/dayflow";
import { resolveOverlaps } from "@/lib/scheduling-utils";
import { generateRecurringInstances, cleanupOldRecurringInstances } from "@/lib/recurrence-utils";
import {
  loadFromCloud,
  saveToCloud,
  clearCloud,
  subscribeToChanges,
} from "@/lib/cloud-sync";
import { toast } from "sonner";

const STORAGE_KEY = "dayflow-state";

interface DayFlowState {
  isAuthenticated: boolean;
  tasks: Task[];
  timeBlocks: TimeBlock[];
  chatMessages: ChatMessage[];
  preferences: UserPreferences;
  recurrenceRules: RecurrenceRule[];
  hasSeenRollover: boolean;
  lastOpenDate: string;
  customProjects: Record<string, string[]>;
  lastModified: number;
}

const defaultPreferences: UserPreferences = {
  workStartHour: 8,
  workEndHour: 18,
  lunchHour: 12,
  dinnerHour: 18.5,
  workoutTime: "morning",
  defaultTaskDuration: 30,
  includeBreaks: true,
  protectMealTimes: true,
  categories: DEFAULT_CATEGORIES.map((c) => ({
    ...c,
    schedulingWindow:
      c.id === "work"
        ? { startHour: 8, endHour: 18 }
        : c.id === "school"
        ? { startHour: 7, endHour: 22 }
        : c.id === "social"
        ? { startHour: 9, endHour: 23 }
        : { startHour: 7, endHour: 21 }, // life-admin
  })),
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function cleanupStaleData(state: DayFlowState): { state: DayFlowState; cleaned: number } {
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const cutoffDate = new Date(cutoff).toISOString();

  const before = state.tasks.length;
  const tasks = state.tasks.filter((t) => {
    if (t.status !== "completed" && t.status !== "dropped") return true;
    const doneDate = t.completedAt || t.createdAt;
    return doneDate > cutoffDate;
  });

  const taskIds = new Set(tasks.map((t) => t.id));
  const timeBlocks = state.timeBlocks.filter(
    (b) => !b.taskId || taskIds.has(b.taskId)
  );

  const activeProjects = new Set(
    tasks.filter((t) => t.status === "active" && t.project).map((t) => `${t.categoryId}:${t.project}`)
  );
  const customProjects: Record<string, string[]> = {};
  for (const [catId, projects] of Object.entries(state.customProjects)) {
    const kept = projects.filter((p) => activeProjects.has(`${catId}:${p}`));
    if (kept.length > 0) customProjects[catId] = kept;
  }

  const cleaned = before - tasks.length;
  return { state: { ...state, tasks, timeBlocks, customProjects }, cleaned };
}

function loadState(): DayFlowState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...getDefaultState(), ...parsed };
    }
  } catch (e) {
    console.error("Failed to load state from localStorage:", e);
  }
  return getDefaultState();
}

function getDefaultState(): DayFlowState {
  return {
    isAuthenticated: false,
    tasks: [],
    timeBlocks: [],
    chatMessages: [],
    preferences: defaultPreferences,
    recurrenceRules: [],
    hasSeenRollover: false,
    lastOpenDate: "",
    customProjects: {},
    lastModified: 0,
  };
}

function saveState(state: DayFlowState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state to localStorage:", e);
  }
}

const today = new Date().toISOString().split("T")[0];

export function useDayFlowStore() {
  const [state, setStateRaw] = useState<DayFlowState>(loadState);
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  // Prevents real-time events from triggering a sync back to Supabase
  const isRemoteUpdate = useRef(false);

  // Helper: update state + localStorage only (no cloud sync)
  const setStateLocal = useCallback(
    (updater: (prev: DayFlowState) => DayFlowState) => {
      setStateRaw((prev) => {
        const next = { ...updater(prev), lastModified: Date.now() };
        saveState(next);
        return next;
      });
    },
    []
  );

  // Load from Supabase on mount, subscribe to real-time
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    // 1. Fetch all data from Supabase
    loadFromCloud()
      .then((cloud) => {
        if (cloud) {
          setStateRaw((prev) => {
            const next: DayFlowState = {
              ...prev,
              tasks: cloud.tasks.length > 0 ? cloud.tasks : prev.tasks,
              timeBlocks: cloud.timeBlocks.length > 0 ? cloud.timeBlocks : prev.timeBlocks,
              chatMessages: cloud.chatMessages.length > 0 ? cloud.chatMessages : prev.chatMessages,
              preferences: cloud.preferences,
              customProjects: cloud.customProjects,
              hasSeenRollover: cloud.hasSeenRollover,
              lastOpenDate: cloud.lastOpenDate,
              lastModified: Date.now(),
            };
            saveState(next);
            return next;
          });
        }
      })
      .finally(() => {
        // 30-day cleanup
        setStateRaw((current) => {
          const { state: cleaned, cleaned: count } = cleanupStaleData(current);
          if (count > 0) {
            saveState(cleaned);
            saveToCloud(cleaned);
            setTimeout(() => {
              toast(`Cleaned up ${count} old task${count > 1 ? "s" : ""}`);
            }, 1000);
            return cleaned;
          }
          return current;
        });

        // Generate recurring task instances for the rolling window
        setStateRaw((current) => {
          if (current.recurrenceRules.length === 0) return current;
          const { newTasks, newBlocks } = generateRecurringInstances(
            current.recurrenceRules,
            current.tasks,
            current.timeBlocks,
            current.preferences.categories
          );
          if (newTasks.length === 0) return current;
          const cleaned = cleanupOldRecurringInstances(
            [...current.tasks, ...newTasks],
            [...current.timeBlocks, ...newBlocks]
          );
          const next = { ...current, tasks: cleaned.tasks, timeBlocks: cleaned.timeBlocks, lastModified: Date.now() };
          saveState(next);
          saveToCloud(next);
          return next;
        });
      });

    // 2. Subscribe to real-time changes from other devices
    unsubscribe = subscribeToChanges({
      onTaskChange: (task, eventType) => {
        isRemoteUpdate.current = true;
        setStateLocal((prev) => {
          let tasks: Task[];
          if (eventType === "DELETE") {
            tasks = prev.tasks.filter((t) => t.id !== task.id);
          } else {
            const exists = prev.tasks.some((t) => t.id === task.id);
            tasks = exists
              ? prev.tasks.map((t) => (t.id === task.id ? task : t))
              : [...prev.tasks, task];
          }
          return { ...prev, tasks };
        });
        isRemoteUpdate.current = false;
      },
      onBlockChange: (block, eventType) => {
        isRemoteUpdate.current = true;
        setStateLocal((prev) => {
          let timeBlocks: TimeBlock[];
          if (eventType === "DELETE") {
            timeBlocks = prev.timeBlocks.filter((b) => b.id !== block.id);
          } else {
            const exists = prev.timeBlocks.some((b) => b.id === block.id);
            timeBlocks = exists
              ? prev.timeBlocks.map((b) => (b.id === block.id ? block : b))
              : [...prev.timeBlocks, block];
          }
          return { ...prev, timeBlocks };
        });
        isRemoteUpdate.current = false;
      },
      onMessageChange: (msg, eventType) => {
        isRemoteUpdate.current = true;
        setStateLocal((prev) => {
          let chatMessages: ChatMessage[];
          if (eventType === "DELETE") {
            chatMessages = prev.chatMessages.filter((m) => m.id !== msg.id);
          } else {
            const exists = prev.chatMessages.some((m) => m.id === msg.id);
            chatMessages = exists
              ? prev.chatMessages.map((m) => (m.id === msg.id ? msg : m))
              : [...prev.chatMessages, msg];
          }
          return { ...prev, chatMessages };
        });
        isRemoteUpdate.current = false;
      },
      onProfileChange: (data) => {
        isRemoteUpdate.current = true;
        setStateLocal((prev) => ({
          ...prev,
          preferences: data.preferences,
          customProjects: data.customProjects,
          hasSeenRollover: data.hasSeenRollover,
          lastOpenDate: data.lastOpenDate,
        }));
        isRemoteUpdate.current = false;
      },
    });

    return () => {
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also re-fetch from Supabase when tab regains focus (handles phone ↔ laptop switching)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadFromCloud().then((cloud) => {
          if (cloud) {
            setStateLocal((prev) => ({
              ...prev,
              tasks: cloud.tasks.length > 0 ? cloud.tasks : prev.tasks,
              timeBlocks: cloud.timeBlocks.length > 0 ? cloud.timeBlocks : prev.timeBlocks,
              chatMessages: cloud.chatMessages.length > 0 ? cloud.chatMessages : prev.chatMessages,
              preferences: cloud.preferences,
              customProjects: cloud.customProjects,
              hasSeenRollover: cloud.hasSeenRollover,
              lastOpenDate: cloud.lastOpenDate,
            }));
          }
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [setStateLocal]);

  // Main setState: updates React state + localStorage + debounced Supabase sync
  const setState = useCallback(
    (updater: (prev: DayFlowState) => DayFlowState) => {
      setStateRaw((prev) => {
        const next = { ...updater(prev), lastModified: Date.now() };
        saveState(next);

        // Skip cloud sync if this change originated from a real-time event
        if (!isRemoteUpdate.current) {
          if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
          cloudSaveTimer.current = setTimeout(() => {
            saveToCloud(next);
          }, 1000);
        }

        return next;
      });
    },
    []
  );

  const authenticate = useCallback(() => {
    setState((s) => ({ ...s, isAuthenticated: true }));
  }, [setState]);

  const addTask = useCallback((task: Task) => {
    setState((s) => ({ ...s, tasks: [...s.tasks, task] }));
  }, [setState]);

  const addTasks = useCallback((tasks: Task[]) => {
    setState((s) => ({ ...s, tasks: [...s.tasks, ...tasks] }));
  }, [setState]);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  }, [setState]);

  const toggleTaskComplete = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: t.status === "completed" ? ("active" as const) : ("completed" as const),
              completedAt: t.status === "completed" ? undefined : new Date().toISOString(),
            }
          : t
      ),
    }));
  }, [setState]);

  const dropTask = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id
          ? { ...t, status: "dropped" as const, completedAt: new Date().toISOString() }
          : t
      ),
      // Remove associated time blocks from the schedule
      timeBlocks: s.timeBlocks.filter((b) => b.taskId !== id),
    }));
  }, [setState]);

  const restoreTask = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id
          ? { ...t, status: "active" as const, completedAt: undefined }
          : t
      ),
    }));
  }, [setState]);

  const deferTask = useCallback((id: string) => {
    setState((s) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split("T")[0];

      // Move any linked time block to tomorrow
      const timeBlocks = s.timeBlocks.map((b) =>
        b.taskId === id ? { ...b, date: tomorrowStr } : b
      );

      return {
        ...s,
        tasks: s.tasks.map((t) =>
          t.id === id ? { ...t, rolloverCount: t.rolloverCount + 1 } : t
        ),
        timeBlocks,
      };
    });
  }, [setState]);

  const deleteTask = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.filter((t) => t.id !== id),
    }));
  }, [setState]);

  const setTimeBlocks = useCallback((blocks: TimeBlock[]) => {
    setState((s) => ({ ...s, timeBlocks: blocks }));
  }, [setState]);

  const addChatMessage = useCallback((msg: ChatMessage) => {
    setState((s) => ({ ...s, chatMessages: [...s.chatMessages, msg] }));
  }, [setState]);

  const clearChat = useCallback(() => {
    setState((s) => ({ ...s, chatMessages: [] }));
  }, [setState]);

  const updatePreferences = useCallback((prefs: Partial<UserPreferences>) => {
    setState((s) => ({ ...s, preferences: { ...s.preferences, ...prefs } }));
  }, [setState]);

  const setHasSeenRollover = useCallback((val: boolean) => {
    setState((s) => ({ ...s, hasSeenRollover: val, lastOpenDate: today }));
  }, [setState]);

  const getCategory = useCallback(
    (id: string): Category | undefined => {
      return state.preferences.categories.find((c) => c.id === id);
    },
    [state.preferences.categories]
  );

  const getBlocksForDate = useCallback(
    (date: string) => state.timeBlocks.filter((b) => b.date === date),
    [state.timeBlocks]
  );

  const getRolloverTasks = useCallback(() => {
    return state.tasks.filter((t) => t.status === "active" && t.rolloverCount > 0);
  }, [state.tasks]);

  const addTimeBlock = useCallback((block: TimeBlock) => {
    setState((s) => ({ ...s, timeBlocks: [...s.timeBlocks, block] }));
  }, [setState]);

  const addTimeBlocks = useCallback((blocks: TimeBlock[]) => {
    setState((s) => ({ ...s, timeBlocks: [...s.timeBlocks, ...blocks] }));
  }, [setState]);

  const updateTimeBlock = useCallback((id: string, updates: Partial<TimeBlock>) => {
    setState((s) => ({
      ...s,
      timeBlocks: s.timeBlocks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    }));
  }, [setState]);

  const removeTimeBlock = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      timeBlocks: s.timeBlocks.filter((b) => b.id !== id),
    }));
  }, [setState]);

  const moveBlockToDate = useCallback((blockId: string, newDate: string) => {
    setState((s) => {
      const updated = s.timeBlocks.map((b) =>
        b.id === blockId ? { ...b, date: newDate } : b
      );
      // Resolve any overlaps on the target date
      const resolved = resolveOverlaps(updated, blockId);
      return { ...s, timeBlocks: resolved };
    });
  }, [setState]);

  const displaceBlock = useCallback((blockId: string) => {
    setState((s) => {
      const resolved = resolveOverlaps(s.timeBlocks, blockId);
      return { ...s, timeBlocks: resolved };
    });
  }, [setState]);

  const reorderTasks = useCallback((orderedIds: string[]) => {
    setState((s) => {
      const taskMap = new Map(s.tasks.map((t) => [t.id, t]));
      const reordered = orderedIds
        .map((id, i) => {
          const task = taskMap.get(id);
          return task ? { ...task, priority: i + 1 } : null;
        })
        .filter(Boolean) as Task[];
      const reorderedIds = new Set(orderedIds);
      const rest = s.tasks.filter((t) => !reorderedIds.has(t.id));
      return { ...s, tasks: [...reordered, ...rest] };
    });
  }, [setState]);

  // --- Recurrence ---
  const addRecurrenceRule = useCallback((rule: RecurrenceRule) => {
    setState((s) => ({ ...s, recurrenceRules: [...s.recurrenceRules, rule] }));
  }, [setState]);

  const updateRecurrenceRule = useCallback((id: string, updates: Partial<RecurrenceRule>) => {
    setState((s) => ({
      ...s,
      recurrenceRules: s.recurrenceRules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    }));
  }, [setState]);

  const deleteRecurrenceRule = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      recurrenceRules: s.recurrenceRules.filter((r) => r.id !== id),
      // Also remove future pending instances of this rule
      tasks: s.tasks.filter((t) => {
        if (t.recurringRuleId !== id) return true;
        // Keep completed instances, remove active/pending ones in the future
        if (t.status === "completed") return true;
        return false;
      }),
    }));
  }, [setState]);

  const generateRecurrences = useCallback(() => {
    setState((s) => {
      if (s.recurrenceRules.length === 0) return s;
      const { newTasks, newBlocks } = generateRecurringInstances(
        s.recurrenceRules,
        s.tasks,
        s.timeBlocks,
        s.preferences.categories
      );
      if (newTasks.length === 0) return s;
      // Also clean up old instances
      const cleaned = cleanupOldRecurringInstances(
        [...s.tasks, ...newTasks],
        [...s.timeBlocks, ...newBlocks]
      );
      return { ...s, tasks: cleaned.tasks, timeBlocks: cleaned.timeBlocks };
    });
  }, [setState]);

  const addProject = useCallback((categoryId: string, projectName: string) => {
    setState((s) => {
      const existing = s.customProjects[categoryId] || [];
      if (existing.includes(projectName)) return s;
      return {
        ...s,
        customProjects: {
          ...s.customProjects,
          [categoryId]: [...existing, projectName],
        },
      };
    });
  }, [setState]);

  const clearAllData = useCallback(async () => {
    const fresh = getDefaultState();
    setStateRaw(fresh);
    saveState(fresh);
    await clearCloud();
  }, []);

  return {
    ...state,
    authenticate,
    addTask,
    addTasks,
    updateTask,
    toggleTaskComplete,
    dropTask,
    restoreTask,
    deferTask,
    deleteTask,
    setTimeBlocks,
    addChatMessage,
    clearChat,
    updatePreferences,
    setHasSeenRollover,
    getCategory,
    getBlocksForDate,
    getRolloverTasks,
    addTimeBlock,
    addTimeBlocks,
    updateTimeBlock,
    removeTimeBlock,
    moveBlockToDate,
    displaceBlock,
    reorderTasks,
    addProject,
    addRecurrenceRule,
    updateRecurrenceRule,
    deleteRecurrenceRule,
    generateRecurrences,
    clearAllData,
    setState,
  };
}
