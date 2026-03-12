// DayFlow store — localStorage-backed state management
import { useState, useCallback } from "react";
import {
  Task,
  TimeBlock,
  ChatMessage,
  UserPreferences,
  DEFAULT_CATEGORIES,
  Category,
} from "@/types/dayflow";

// Simple global state with localStorage persistence
const STORAGE_KEY = "dayflow-state";

interface DayFlowState {
  isAuthenticated: boolean;
  tasks: Task[];
  timeBlocks: TimeBlock[];
  chatMessages: ChatMessage[];
  preferences: UserPreferences;
  hasSeenRollover: boolean;
  lastOpenDate: string;
}

const defaultPreferences: UserPreferences = {
  workStartHour: 8,
  workEndHour: 18,
  lunchHour: 12,
  workoutTime: "morning",
  defaultTaskDuration: 30,
  categories: DEFAULT_CATEGORIES,
};

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

  const setState = useCallback((updater: (prev: DayFlowState) => DayFlowState) => {
    setStateRaw((prev) => {
      const next = updater(prev);
      saveState(next);
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
          ? { ...t, status: t.status === "completed" ? "active" : "completed" }
          : t
      ),
    }));
  }, [setState]);

  const dropTask = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: "dropped" as const } : t)),
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
    updatePreferences,
    setHasSeenRollover,
    getCategory,
    getBlocksForDate,
    getRolloverTasks,
    addTimeBlock,
    addTimeBlocks,
    updateTimeBlock,
    reorderTasks,
    setState,
  };
}
