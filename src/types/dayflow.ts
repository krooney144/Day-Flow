export type TaskStatus = "active" | "completed" | "dropped";
export type EnergyLevel = "low" | "medium" | "high";
export type TaskHorizon = "today" | "soon" | "this-week" | "backlog";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";

export interface SchedulingWindow {
  startHour: number; // 0-23
  endHour: number;   // 1-24
}

export interface Category {
  id: string;
  name: string;
  color: string; // tailwind cat-* key
  schedulingWindow?: SchedulingWindow; // if undefined, uses full extended hours
}

export interface Task {
  id: string;
  title: string;
  categoryId: string;
  project?: string;
  status: TaskStatus;
  priority: number; // 1 (highest) - 5 (lowest)
  deadline?: string;
  estimatedMinutes: number;
  actualMinutes?: number;
  canSplit: boolean;
  notes: string;
  preferredTime: TimeOfDay;
  energyNeeded: EnergyLevel;
  location?: string;
  recurring: boolean;
  recurringRuleId?: string;    // If this is a generated instance, links to the RecurrenceRule
  projectGoal?: string;
  createdAt: string;
  completedAt?: string;
  rolloverCount: number;
  timeBlockId?: string;
  horizon: TaskHorizon;
}

export interface TimeBlock {
  id: string;
  taskId?: string;
  title: string;
  categoryId: string;
  date: string; // YYYY-MM-DD
  startHour: number; // 0-23, decimal for half hours
  durationHours: number;
  isFixed: boolean; // meetings, events
  type: "task" | "meal" | "break" | "transition" | "event";
}

export type RecurrenceFrequency = "daily" | "weekdays" | "weekly" | "biweekly" | "monthly";

export interface RecurrenceRule {
  id: string;
  templateTaskId: string;     // The task that serves as a template
  frequency: RecurrenceFrequency;
  daysOfWeek?: number[];      // 0=Sun, 1=Mon, ..., 6=Sat (for weekly/biweekly)
  startDate: string;          // YYYY-MM-DD — when recurrence begins
  endDate?: string;           // YYYY-MM-DD — optional end date
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface UserPreferences {
  workStartHour: number;
  workEndHour: number;
  lunchHour: number;
  dinnerHour: number;
  workoutTime: TimeOfDay;
  defaultTaskDuration: number;
  includeBreaks: boolean;
  protectMealTimes: boolean;
  sleepStartHour: number;  // e.g. 23 = 11 PM
  sleepEndHour: number;    // e.g. 7 = 7 AM
  categories: Category[];
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "work", name: "Work", color: "blue" },
  { id: "school", name: "School", color: "grape" },
  { id: "social", name: "Social", color: "rose" },
  { id: "life-admin", name: "Life Admin", color: "teal" },
];

export const DEFAULT_PROJECTS: Record<string, string[]> = {
  work: ["Marble Point", "Black Island", "Work Admin"],
  school: ["NVL", "Grad Thesis", "School Admin"],
  social: ["Trips", "Networking", "Fun", "Phone Calls"],
  "life-admin": ["Food Planning", "Workouts", "House Tasks", "Photo Posts"],
};

export const CATEGORY_COLOR_MAP: Record<string, string> = {
  blue: "bg-cat-blue",
  grape: "bg-cat-grape",
  teal: "bg-cat-teal",
  green: "bg-cat-green",
  mauve: "bg-cat-mauve",
  rose: "bg-cat-rose",
  navy: "bg-cat-navy",
};

export const CATEGORY_COLOR_BG_MAP: Record<string, string> = {
  blue: "bg-cat-blue/20",
  grape: "bg-cat-grape/20",
  teal: "bg-cat-teal/20",
  green: "bg-cat-green/20",
  mauve: "bg-cat-mauve/20",
  rose: "bg-cat-rose/20",
  navy: "bg-cat-navy/20",
};

export const CATEGORY_TEXT_COLOR_MAP: Record<string, string> = {
  blue: "text-cat-blue",
  grape: "text-cat-grape",
  teal: "text-cat-teal",
  green: "text-cat-green",
  mauve: "text-cat-mauve",
  rose: "text-cat-rose",
  navy: "text-cat-navy",
};
