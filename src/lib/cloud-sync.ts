import { supabase } from "@/integrations/supabase/client";
import {
  Task,
  TimeBlock,
  ChatMessage,
  UserPreferences,
  DEFAULT_CATEGORIES,
} from "@/types/dayflow";

const USER_ID = "1121";

// ── camelCase ↔ snake_case converters ──────────────────────────────

function taskToRow(task: Task) {
  return {
    id: task.id,
    user_id: USER_ID,
    title: task.title,
    category_id: task.categoryId,
    project: task.project ?? null,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline ?? null,
    estimated_minutes: task.estimatedMinutes,
    actual_minutes: task.actualMinutes ?? null,
    can_split: task.canSplit,
    notes: task.notes,
    preferred_time: task.preferredTime,
    energy_needed: task.energyNeeded,
    location: task.location ?? null,
    recurring: task.recurring,
    project_goal: task.projectGoal ?? null,
    created_at: task.createdAt,
    completed_at: task.completedAt ?? null,
    rollover_count: task.rolloverCount,
    time_block_id: task.timeBlockId ?? null,
    horizon: task.horizon,
  };
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    categoryId: (row.category_id as string) || "life-admin",
    project: (row.project as string) || undefined,
    status: (row.status as Task["status"]) || "active",
    priority: (row.priority as number) || 3,
    deadline: (row.deadline as string) || undefined,
    estimatedMinutes: (row.estimated_minutes as number) || 30,
    actualMinutes: (row.actual_minutes as number) || undefined,
    canSplit: (row.can_split as boolean) ?? false,
    notes: (row.notes as string) || "",
    preferredTime: (row.preferred_time as Task["preferredTime"]) || "any",
    energyNeeded: (row.energy_needed as Task["energyNeeded"]) || "medium",
    location: (row.location as string) || undefined,
    recurring: (row.recurring as boolean) ?? false,
    projectGoal: (row.project_goal as string) || undefined,
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string) || undefined,
    rolloverCount: (row.rollover_count as number) ?? 0,
    timeBlockId: (row.time_block_id as string) || undefined,
    horizon: (row.horizon as Task["horizon"]) || "today",
  };
}

function blockToRow(block: TimeBlock) {
  return {
    id: block.id,
    user_id: USER_ID,
    task_id: block.taskId ?? null,
    title: block.title,
    category_id: block.categoryId,
    date: block.date,
    start_hour: block.startHour,
    duration_hours: block.durationHours,
    is_fixed: block.isFixed,
    type: block.type,
  };
}

function rowToBlock(row: Record<string, unknown>): TimeBlock {
  return {
    id: row.id as string,
    taskId: (row.task_id as string) || undefined,
    title: row.title as string,
    categoryId: (row.category_id as string) || "",
    date: row.date as string,
    startHour: Number(row.start_hour),
    durationHours: Number(row.duration_hours),
    isFixed: (row.is_fixed as boolean) ?? false,
    type: (row.type as TimeBlock["type"]) || "task",
  };
}

function messageToRow(msg: ChatMessage) {
  return {
    id: msg.id,
    user_id: USER_ID,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
  };
}

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    role: row.role as ChatMessage["role"],
    content: row.content as string,
    timestamp: row.timestamp as string,
  };
}

// ── Load all data on app start ─────────────────────────────────────

export interface SupabaseSnapshot {
  tasks: Task[];
  timeBlocks: TimeBlock[];
  chatMessages: ChatMessage[];
  preferences: UserPreferences;
  customProjects: Record<string, string[]>;
  hasSeenRollover: boolean;
  lastOpenDate: string;
}

export async function loadFromCloud(): Promise<SupabaseSnapshot | null> {
  try {
    const [tasksRes, blocksRes, msgsRes, profileRes] = await Promise.all([
      supabase.from("tasks").select("*").eq("user_id", USER_ID),
      supabase.from("time_blocks").select("*").eq("user_id", USER_ID),
      supabase.from("chat_messages").select("*").eq("user_id", USER_ID),
      supabase.from("profiles").select("*").eq("user_id", USER_ID).single(),
    ]);

    const errors = [tasksRes.error, blocksRes.error, msgsRes.error, profileRes.error].filter(Boolean);
    if (errors.length > 0) {
      console.error("Supabase load errors:", errors);
      return null;
    }

    const profile = profileRes.data as Record<string, unknown>;
    const prefsData = (profile.preferences as Record<string, unknown>) || {};
    const categoriesData = (profile.categories as unknown[]) || DEFAULT_CATEGORIES;

    return {
      tasks: ((tasksRes.data as Record<string, unknown>[]) || []).map(rowToTask),
      timeBlocks: ((blocksRes.data as Record<string, unknown>[]) || []).map(rowToBlock),
      chatMessages: ((msgsRes.data as Record<string, unknown>[]) || [])
        .map(rowToMessage)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      preferences: {
        workStartHour: (prefsData.workStartHour as number) ?? 8,
        workEndHour: (prefsData.workEndHour as number) ?? 18,
        lunchHour: (prefsData.lunchHour as number) ?? 12,
        workoutTime: (prefsData.workoutTime as UserPreferences["workoutTime"]) ?? "morning",
        defaultTaskDuration: (prefsData.defaultTaskDuration as number) ?? 30,
        categories: categoriesData as UserPreferences["categories"],
      },
      customProjects: (profile.custom_projects as Record<string, string[]>) || {},
      hasSeenRollover: (profile.has_seen_rollover as boolean) ?? false,
      lastOpenDate: (profile.last_open_date as string) || "",
    };
  } catch (err) {
    console.error("Failed to load from Supabase:", err);
    return null;
  }
}

// ── Save full state to Supabase (debounced, called from store) ────

export async function saveToCloud(state: {
  tasks: Task[];
  timeBlocks: TimeBlock[];
  chatMessages: ChatMessage[];
  preferences: UserPreferences;
  customProjects: Record<string, string[]>;
  hasSeenRollover: boolean;
  lastOpenDate: string;
}): Promise<boolean> {
  try {
    const results = await Promise.all([
      syncTasks(state.tasks),
      syncTimeBlocks(state.timeBlocks),
      syncChatMessages(state.chatMessages),
      syncProfile(state),
    ]);
    return results.every(Boolean);
  } catch (err) {
    console.error("Failed to save to Supabase:", err);
    return false;
  }
}

async function syncTasks(tasks: Task[]): Promise<boolean> {
  try {
    // Upsert all current tasks
    if (tasks.length > 0) {
      const { error } = await supabase
        .from("tasks")
        .upsert(tasks.map(taskToRow), { onConflict: "id" });
      if (error) { console.error("Task upsert error:", error); return false; }
    }
    // Delete tasks removed locally
    const { data: remote } = await supabase
      .from("tasks")
      .select("id")
      .eq("user_id", USER_ID);
    if (remote) {
      const localIds = new Set(tasks.map((t) => t.id));
      const toDelete = (remote as { id: string }[])
        .filter((r) => !localIds.has(r.id))
        .map((r) => r.id);
      if (toDelete.length > 0) {
        await supabase.from("tasks").delete().in("id", toDelete);
      }
    }
    return true;
  } catch (err) {
    console.error("syncTasks error:", err);
    return false;
  }
}

async function syncTimeBlocks(blocks: TimeBlock[]): Promise<boolean> {
  try {
    if (blocks.length > 0) {
      const { error } = await supabase
        .from("time_blocks")
        .upsert(blocks.map(blockToRow), { onConflict: "id" });
      if (error) { console.error("TimeBlock upsert error:", error); return false; }
    }
    const { data: remote } = await supabase
      .from("time_blocks")
      .select("id")
      .eq("user_id", USER_ID);
    if (remote) {
      const localIds = new Set(blocks.map((b) => b.id));
      const toDelete = (remote as { id: string }[])
        .filter((r) => !localIds.has(r.id))
        .map((r) => r.id);
      if (toDelete.length > 0) {
        await supabase.from("time_blocks").delete().in("id", toDelete);
      }
    }
    return true;
  } catch (err) {
    console.error("syncTimeBlocks error:", err);
    return false;
  }
}

async function syncChatMessages(messages: ChatMessage[]): Promise<boolean> {
  try {
    if (messages.length > 0) {
      const { error } = await supabase
        .from("chat_messages")
        .upsert(messages.map(messageToRow), { onConflict: "id" });
      if (error) { console.error("ChatMessage upsert error:", error); return false; }
    }
    const { data: remote } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("user_id", USER_ID);
    if (remote) {
      const localIds = new Set(messages.map((m) => m.id));
      const toDelete = (remote as { id: string }[])
        .filter((r) => !localIds.has(r.id))
        .map((r) => r.id);
      if (toDelete.length > 0) {
        await supabase.from("chat_messages").delete().in("id", toDelete);
      }
    }
    return true;
  } catch (err) {
    console.error("syncChatMessages error:", err);
    return false;
  }
}

async function syncProfile(state: {
  preferences: UserPreferences;
  customProjects: Record<string, string[]>;
  hasSeenRollover: boolean;
  lastOpenDate: string;
}): Promise<boolean> {
  try {
    const { categories, ...prefs } = state.preferences;
    const { error } = await supabase
      .from("profiles")
      .update({
        preferences: prefs as unknown as Record<string, unknown>,
        categories: categories as unknown as Record<string, unknown>[],
        custom_projects: state.customProjects as unknown as Record<string, unknown>,
        has_seen_rollover: state.hasSeenRollover,
        last_open_date: state.lastOpenDate,
      })
      .eq("user_id", USER_ID);
    if (error) { console.error("Profile update error:", error); return false; }
    return true;
  } catch (err) {
    console.error("syncProfile error:", err);
    return false;
  }
}

// ── Clear all cloud data ──────────────────────────────────────────

export async function clearCloud(): Promise<boolean> {
  try {
    await Promise.all([
      supabase.from("tasks").delete().eq("user_id", USER_ID),
      supabase.from("time_blocks").delete().eq("user_id", USER_ID),
      supabase.from("chat_messages").delete().eq("user_id", USER_ID),
      supabase.from("profiles").update({
        preferences: { workStartHour: 8, workEndHour: 18, lunchHour: 12, workoutTime: "morning", defaultTaskDuration: 30 } as unknown as Record<string, unknown>,
        categories: DEFAULT_CATEGORIES as unknown as Record<string, unknown>[],
        custom_projects: {} as unknown as Record<string, unknown>,
        has_seen_rollover: false,
        last_open_date: "",
      }).eq("user_id", USER_ID),
    ]);
    return true;
  } catch {
    return false;
  }
}

// ── Real-time subscriptions ───────────────────────────────────────

export interface RealtimeCallbacks {
  onTaskChange: (task: Task, eventType: "INSERT" | "UPDATE" | "DELETE") => void;
  onBlockChange: (block: TimeBlock, eventType: "INSERT" | "UPDATE" | "DELETE") => void;
  onMessageChange: (msg: ChatMessage, eventType: "INSERT" | "UPDATE" | "DELETE") => void;
  onProfileChange: (data: {
    preferences: UserPreferences;
    customProjects: Record<string, string[]>;
    hasSeenRollover: boolean;
    lastOpenDate: string;
  }) => void;
}

export function subscribeToChanges(callbacks: RealtimeCallbacks): () => void {
  const channel = supabase
    .channel("dayflow-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${USER_ID}` },
      (payload) => {
        const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        if (eventType === "DELETE") {
          const old = payload.old as Record<string, unknown>;
          callbacks.onTaskChange({ id: old.id as string } as Task, "DELETE");
        } else {
          callbacks.onTaskChange(rowToTask(payload.new as Record<string, unknown>), eventType);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "time_blocks", filter: `user_id=eq.${USER_ID}` },
      (payload) => {
        const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        if (eventType === "DELETE") {
          const old = payload.old as Record<string, unknown>;
          callbacks.onBlockChange({ id: old.id as string } as TimeBlock, "DELETE");
        } else {
          callbacks.onBlockChange(rowToBlock(payload.new as Record<string, unknown>), eventType);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "chat_messages", filter: `user_id=eq.${USER_ID}` },
      (payload) => {
        const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        if (eventType === "DELETE") {
          const old = payload.old as Record<string, unknown>;
          callbacks.onMessageChange({ id: old.id as string } as ChatMessage, "DELETE");
        } else {
          callbacks.onMessageChange(rowToMessage(payload.new as Record<string, unknown>), eventType);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${USER_ID}` },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        const prefsData = (row.preferences as Record<string, unknown>) || {};
        const categoriesData = (row.categories as unknown[]) || DEFAULT_CATEGORIES;
        callbacks.onProfileChange({
          preferences: {
            workStartHour: (prefsData.workStartHour as number) ?? 8,
            workEndHour: (prefsData.workEndHour as number) ?? 18,
            lunchHour: (prefsData.lunchHour as number) ?? 12,
            workoutTime: (prefsData.workoutTime as UserPreferences["workoutTime"]) ?? "morning",
            defaultTaskDuration: (prefsData.defaultTaskDuration as number) ?? 30,
            categories: categoriesData as UserPreferences["categories"],
          },
          customProjects: (row.custom_projects as Record<string, string[]>) || {},
          hasSeenRollover: (row.has_seen_rollover as boolean) ?? false,
          lastOpenDate: (row.last_open_date as string) || "",
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
