// DayFlow store — localStorage + cloud-backed state management
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Task,
  TimeBlock,
  ChatMessage,
  UserPreferences,
  DEFAULT_CATEGORIES,
  Category,
} from "@/types/dayflow";
import { loadFromCloud, saveToCloud, clearCloud } from "@/lib/cloud-sync";
import { toast } from "sonner";

// Simple global state with localStorage persistence + cloud sync
const STORAGE_KEY = "dayflow-state";

interface DayFlowState {
  isAuthenticated: boolean;
  tasks: Task[];
  timeBlocks: TimeBlock[];
  chatMessages: ChatMessage[];
  preferences: UserPreferences;
  hasSeenRollover: boolean;
  lastOpenDate: string;
  customProjects: Record<string, string[]>;
  lastModified: number;
}

const defaultPreferences: UserPreferences = {
  workStartHour: 8,
  workEndHour: 18,
  lunchHour: 12,
  workoutTime: "morning",
  defaultTaskDuration: 30,
  categories: DEFAULT_CATEGORIES,
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function cleanupStaleData(state: DayFlowState): { state: DayFlowState; cleaned: number } {
  const cutoff = Date.now() - THIRTY_DAYS_MS;
  const cutoffDate = new Date(cutoff).toISOString();

  // Remove completed/dropped tasks older than 30 days
  const before = state.tasks.length;
  const tasks = state.tasks.filter((t) => {
    if (t.status !== "completed" && t.status !== "dropped") return true;
    const doneDate = t.completedAt || t.createdAt;
    return doneDate > cutoffDate;
  });

  // Remove orphaned time blocks for deleted tasks
  const taskIds = new Set(tasks.map((t) => t.id));
  const timeBlocks = state.timeBlocks.filter(
    (b) => !b.taskId || taskIds.has(b.taskId)
  );

  // Prune custom projects with no active tasks for 30+ days
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
    tasks: SAMPLE_TASKS,
    timeBlocks: generateSampleBlocks(),
    chatMessages: [],
    preferences: defaultPreferences,
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

const SAMPLE_TASKS: Task[] = [
  {
    id: "t1", title: "Review project proposal", categoryId: "work", project: "Marble Point", status: "active",
    priority: 1, estimatedMinutes: 45, canSplit: false, notes: "", preferredTime: "morning",
    energyNeeded: "high", recurring: false, createdAt: today, rolloverCount: 0, horizon: "today",
  },
  {
    id: "t2", title: "Grocery shopping", categoryId: "life-admin", project: "Food Planning", status: "active",
    priority: 3, estimatedMinutes: 40, canSplit: false, notes: "Get veggies and protein", preferredTime: "afternoon",
    energyNeeded: "low", recurring: false, createdAt: today, rolloverCount: 0, horizon: "today",
  },
  {
    id: "t3", title: "30 min yoga", categoryId: "life-admin", project: "Workouts", status: "active",
    priority: 2, estimatedMinutes: 30, canSplit: false, notes: "", preferredTime: "morning",
    energyNeeded: "medium", recurring: true, createdAt: today, rolloverCount: 0, horizon: "today",
  },
  {
    id: "t4", title: "Call insurance company", categoryId: "life-admin", project: "House Tasks", status: "active",
    priority: 2, estimatedMinutes: 20, canSplit: false, notes: "Ask about claim #4421", preferredTime: "afternoon",
    energyNeeded: "low", recurring: false, createdAt: today, rolloverCount: 2, horizon: "today",
  },
  {
    id: "t5", title: "Coffee with Sarah", categoryId: "social", project: "Fun", status: "active",
    priority: 3, estimatedMinutes: 60, canSplit: false, notes: "", preferredTime: "afternoon",
    energyNeeded: "low", recurring: false, createdAt: today, rolloverCount: 0, horizon: "today",
  },
];

function generateSampleBlocks(): TimeBlock[] {
  return [
    { id: "b1", taskId: "t3", title: "30 min yoga", categoryId: "life-admin", date: today, startHour: 7, durationHours: 0.5, isFixed: false, type: "task" },
    { id: "b-break1", title: "Morning reset", categoryId: "", date: today, startHour: 7.5, durationHours: 0.25, isFixed: false, type: "break" },
    { id: "b2", taskId: "t1", title: "Review project proposal", categoryId: "work", date: today, startHour: 8, durationHours: 0.75, isFixed: false, type: "task" },
    { id: "b-meeting", title: "Team standup", categoryId: "work", date: today, startHour: 11, durationHours: 0.5, isFixed: true, type: "event" },
    { id: "b-lunch", title: "Lunch", categoryId: "", date: today, startHour: 12, durationHours: 0.75, isFixed: false, type: "meal" },
    { id: "b4", taskId: "t4", title: "Call insurance company", categoryId: "life-admin", date: today, startHour: 13, durationHours: 0.5, isFixed: false, type: "task" },
    { id: "b5", taskId: "t2", title: "Grocery shopping", categoryId: "life-admin", date: today, startHour: 14, durationHours: 0.75, isFixed: false, type: "task" },
    { id: "b6", taskId: "t5", title: "Coffee with Sarah", categoryId: "social", date: today, startHour: 15.5, durationHours: 1, isFixed: false, type: "task" },
  ];
}

export function useDayFlowStore() {
  const [state, setStateRaw] = useState<DayFlowState>(loadState);
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load from cloud on mount — cloud wins if newer, then run cleanup
  useEffect(() => {
    loadFromCloud<DayFlowState>().then((cloudState) => {
      if (cloudState && (cloudState.lastModified || 0) > (state.lastModified || 0)) {
        const merged = { ...getDefaultState(), ...cloudState };
        setStateRaw(merged);
        saveState(merged);
      }
    }).finally(() => {
      // Run 30-day cleanup after state is settled
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setState = useCallback((updater: (prev: DayFlowState) => DayFlowState) => {
    setStateRaw((prev) => {
      const next = { ...updater(prev), lastModified: Date.now() };
      saveState(next);
      // Debounced cloud save (1 second)
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
      cloudSaveTimer.current = setTimeout(() => {
        saveToCloud(next);
      }, 1000);
      return next;
    });
  }, []);

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
    }));
  }, [setState]);

  const deferTask = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, rolloverCount: t.rolloverCount + 1 } : t
      ),
    }));
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

  const reorderTasks = useCallback((orderedIds: string[]) => {
    setState((s) => {
      const taskMap = new Map(s.tasks.map((t) => [t.id, t]));
      const reordered = orderedIds
        .map((id, i) => {
          const task = taskMap.get(id);
          return task ? { ...task, priority: i + 1 } : null;
        })
        .filter(Boolean) as Task[];
      // Keep tasks not in the reorder list unchanged
      const reorderedIds = new Set(orderedIds);
      const rest = s.tasks.filter((t) => !reorderedIds.has(t.id));
      return { ...s, tasks: [...reordered, ...rest] };
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
    reorderTasks,
    addProject,
    clearAllData,
    setState,
  };
}
