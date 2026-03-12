import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { Task, CATEGORY_COLOR_MAP, EnergyLevel, TimeOfDay, DEFAULT_PROJECTS, RecurrenceFrequency, RecurrenceRule } from "@/types/dayflow";
import { mergeProjects } from "@/lib/project-utils";
import { X, Calendar, Clock, Tag, FileText, Zap, MapPin, Repeat, Timer, FolderOpen, ArrowRight, ArrowLeft, Minus, Plus } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn, formatHour } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  task: Task | null;
  onClose: () => void;
}

const DURATION_CHIPS = [15, 30, 45, 60, 90, 120];
const PRIORITY_OPTIONS = [1, 2, 3, 4, 5];
const TIME_OPTIONS: TimeOfDay[] = ["morning", "afternoon", "evening", "any"];
const ENERGY_OPTIONS: EnergyLevel[] = ["low", "medium", "high"];

export default function TaskDetailSheet({ task, onClose }: Props) {
  const { getCategory, updateTask, dropTask, timeBlocks, preferences, customProjects, moveBlockToDate, updateTimeBlock, recurrenceRules, addRecurrenceRule, deleteRecurrenceRule } = useDayFlow();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [priority, setPriority] = useState(3);
  const [preferredTime, setPreferredTime] = useState<TimeOfDay>("any");
  const [energyNeeded, setEnergyNeeded] = useState<EnergyLevel>("medium");
  const [categoryId, setCategoryId] = useState("work");
  const [project, setProject] = useState<string | undefined>();
  const [deadline, setDeadline] = useState<Date | undefined>();

  const titleTimer = useRef<ReturnType<typeof setTimeout>>();
  const notesTimer = useRef<ReturnType<typeof setTimeout>>();

  // Sync local state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setEstimatedMinutes(task.estimatedMinutes);
      setPriority(task.priority);
      setPreferredTime(task.preferredTime);
      setEnergyNeeded(task.energyNeeded);
      setNotes(task.notes);
      setCategoryId(task.categoryId);
      setProject(task.project);
      setDeadline(task.deadline ? new Date(task.deadline) : undefined);
    }
  }, [task]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (titleTimer.current) clearTimeout(titleTimer.current);
      if (notesTimer.current) clearTimeout(notesTimer.current);
    };
  }, []);

  // Auto-save helper for immediate (non-text) fields
  const autoSave = useCallback(
    (updates: Partial<Task>) => {
      if (!task) return;
      updateTask(task.id, updates);
    },
    [task, updateTask]
  );

  // Debounced save for text fields
  const debouncedSaveTitle = useCallback(
    (value: string) => {
      if (titleTimer.current) clearTimeout(titleTimer.current);
      titleTimer.current = setTimeout(() => {
        if (task && value.trim()) {
          updateTask(task.id, { title: value.trim() });
        }
      }, 500);
    },
    [task, updateTask]
  );

  const debouncedSaveNotes = useCallback(
    (value: string) => {
      if (notesTimer.current) clearTimeout(notesTimer.current);
      notesTimer.current = setTimeout(() => {
        if (task) {
          updateTask(task.id, { notes: value });
        }
      }, 500);
    },
    [task, updateTask]
  );

  if (!task) return null;

  const cat = getCategory(categoryId);
  const dotColor = CATEGORY_COLOR_MAP[cat?.color || "teal"] || "bg-muted";

  // Find scheduled time block
  const scheduledBlock = timeBlocks.find((b) => b.taskId === task.id);

  // Projects for selected category
  const allProjects = mergeProjects(customProjects);
  const availableProjects = allProjects[categoryId] || [];

  const handleDrop = () => {
    dropTask(task.id);
    onClose();
  };

  return (
    <AnimatePresence>
      {task && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-card px-6 pt-4 pb-8"
            style={{ boxShadow: "0 -4px 24px hsl(220 20% 70% / 0.2)" }}
          >
            <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-border" />

            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`cat-dot ${dotColor}`} />
                  <span className="text-xs text-muted-foreground font-medium">{cat?.name}</span>
                  {project && (
                    <span className="text-xs text-muted-foreground">· {project}</span>
                  )}
                </div>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    debouncedSaveTitle(e.target.value);
                  }}
                  className="text-display text-lg text-foreground bg-transparent outline-none w-full focus:ring-1 focus:ring-primary/30 rounded-lg px-1 -mx-1"
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDrop}
                  className="rounded-xl px-3 py-2 text-xs font-medium text-destructive active:bg-muted transition-colors"
                >
                  Drop
                </button>
                <button aria-label="Close" onClick={onClose} className="tap-target flex items-center justify-center rounded-xl p-2 active:bg-secondary">
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="space-y-5">
              {/* Scheduled Time — editable */}
              {scheduledBlock && (
                <ScheduledTimeSection
                  block={scheduledBlock}
                  onUpdateTime={(startHour) => updateTimeBlock(scheduledBlock.id, { startHour })}
                  onMoveToDate={(dateStr) => moveBlockToDate(scheduledBlock.id, dateStr)}
                />
              )}

              {/* Deadline */}
              <FieldSection icon={<Calendar className="h-4 w-4" />} label="Deadline">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn(
                      "text-sm rounded-lg border border-border px-3 py-1.5 text-left",
                      !deadline && "text-muted-foreground"
                    )}>
                      {deadline ? format(deadline, "MMM d, yyyy") : "Set deadline"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={deadline}
                      onSelect={(d) => {
                        setDeadline(d);
                        autoSave({ deadline: d ? d.toISOString() : undefined });
                      }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </FieldSection>

              {/* Category */}
              <FieldSection icon={<Tag className="h-4 w-4" />} label="Category">
                <div className="flex flex-wrap gap-1.5">
                  {preferences.categories.map((c) => {
                    const cDot = CATEGORY_COLOR_MAP[c.color] || "bg-muted";
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCategoryId(c.id);
                          const newProject = c.id !== categoryId ? undefined : project;
                          if (c.id !== categoryId) setProject(undefined);
                          autoSave({ categoryId: c.id, project: newProject });
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                          categoryId === c.id
                            ? "bg-secondary text-foreground ring-1 ring-primary/30"
                            : "bg-muted/50 text-muted-foreground"
                        )}
                      >
                        <div className={`h-2 w-2 rounded-full ${cDot}`} />
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </FieldSection>

              {/* Project */}
              {availableProjects.length > 0 && (
                <FieldSection icon={<FolderOpen className="h-4 w-4" />} label="Project">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => {
                        setProject(undefined);
                        autoSave({ project: undefined });
                      }}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                        !project
                          ? "bg-secondary text-foreground ring-1 ring-primary/30"
                          : "bg-muted/50 text-muted-foreground"
                      )}
                    >
                      None
                    </button>
                    {availableProjects.map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          setProject(p);
                          autoSave({ project: p });
                        }}
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                          project === p
                            ? "bg-secondary text-foreground ring-1 ring-primary/30"
                            : "bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </FieldSection>
              )}

              {/* Priority */}
              <FieldSection icon={<Zap className="h-4 w-4" />} label="Priority">
                <div className="flex gap-1.5">
                  {PRIORITY_OPTIONS.map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setPriority(p);
                        autoSave({ priority: p });
                      }}
                      className={cn(
                        "h-8 w-8 rounded-lg text-xs font-semibold transition-all",
                        priority === p
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </FieldSection>

              {/* Estimated Time */}
              <FieldSection icon={<Clock className="h-4 w-4" />} label="Duration">
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_CHIPS.map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setEstimatedMinutes(d);
                        autoSave({ estimatedMinutes: d });
                        // Sync duration to the scheduled time block
                        if (scheduledBlock) {
                          updateTimeBlock(scheduledBlock.id, { durationHours: d / 60 });
                        }
                      }}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                        estimatedMinutes === d
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {d >= 60 ? `${d / 60}h` : `${d}m`}
                    </button>
                  ))}
                </div>
              </FieldSection>

              {/* Preferred Time */}
              <FieldSection icon={<Tag className="h-4 w-4" />} label="Preferred time">
                <div className="flex gap-1.5">
                  {TIME_OPTIONS.map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setPreferredTime(t);
                        autoSave({ preferredTime: t });
                      }}
                      className={cn(
                        "rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-all",
                        preferredTime === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </FieldSection>

              {/* Energy Needed */}
              <FieldSection icon={<Zap className="h-4 w-4" />} label="Energy">
                <div className="flex gap-1.5">
                  {ENERGY_OPTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        setEnergyNeeded(e);
                        autoSave({ energyNeeded: e });
                      }}
                      className={cn(
                        "rounded-lg px-3 py-1 text-xs font-medium capitalize transition-all",
                        energyNeeded === e
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </FieldSection>

              {/* Location (read-only if present) */}
              {task.location && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium w-24">Location</span>
                  <span className="text-sm text-foreground">{task.location}</span>
                </div>
              )}

              {/* Recurring */}
              <RecurrenceSection
                task={task}
                recurrenceRules={recurrenceRules}
                onAddRule={addRecurrenceRule}
                onDeleteRule={deleteRecurrenceRule}
              />

              {/* Notes */}
              <FieldSection icon={<FileText className="h-4 w-4" />} label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    debouncedSaveNotes(e.target.value);
                  }}
                  placeholder="Add notes..."
                  rows={3}
                  className="w-full text-sm bg-secondary rounded-xl p-3 text-foreground placeholder:text-muted-foreground border-none outline-none resize-none focus:ring-1 focus:ring-primary/30"
                />
              </FieldSection>

              {/* Rollover info */}
              {task.rolloverCount > 0 && (
                <p className="text-xs text-muted-foreground bg-muted rounded-xl p-3">
                  Rolled over {task.rolloverCount} {task.rolloverCount === 1 ? "time" : "times"}.
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function formatBlockDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", year: "2-digit" });
}

function ScheduledTimeSection({
  block,
  onUpdateTime,
  onMoveToDate,
}: {
  block: { id: string; date: string; startHour: number; durationHours: number; isFixed: boolean };
  onUpdateTime: (startHour: number) => void;
  onMoveToDate: (dateStr: string) => void;
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const todayStr = new Date().toISOString().split("T")[0];
  const isToday = block.date === todayStr;

  const adjustTime = (delta: number) => {
    const newHour = Math.max(0, Math.min(23.75, block.startHour + delta));
    onUpdateTime(newHour);
  };

  const moveByDays = (days: number) => {
    const d = new Date(block.date + "T12:00:00");
    d.setDate(d.getDate() + days);
    onMoveToDate(d.toISOString().split("T")[0]);
  };

  return (
    <div className="rounded-xl bg-primary/10 p-3 space-y-2.5">
      {/* Date row */}
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs text-muted-foreground font-medium">Scheduled</span>
        <span className="text-sm text-foreground font-medium ml-auto">
          {formatBlockDate(block.date)}
        </span>
      </div>

      {/* Time editor */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => adjustTime(-0.25)}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-foreground active:bg-muted transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm text-foreground font-medium">
            {formatHour(block.startHour)} – {formatHour(block.startHour + block.durationHours)}
          </p>
        </div>
        <button
          onClick={() => adjustTime(0.25)}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-foreground active:bg-muted transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Move buttons */}
      <div className="flex gap-1.5">
        {!isToday && (
          <button
            onClick={() => onMoveToDate(todayStr)}
            className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground active:bg-border transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Today
          </button>
        )}
        <button
          onClick={() => moveByDays(-1)}
          className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground active:bg-border transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> Prev day
        </button>
        <button
          onClick={() => moveByDays(1)}
          className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground active:bg-border transition-colors"
        >
          Next day <ArrowRight className="h-3 w-3" />
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground active:bg-border transition-colors ml-auto">
              <Calendar className="h-3 w-3" /> Pick
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <CalendarPicker
              mode="single"
              selected={new Date(block.date + "T12:00:00")}
              onSelect={(d) => {
                if (d) {
                  onMoveToDate(d.toISOString().split("T")[0]);
                }
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

const FREQUENCY_OPTIONS: { value: RecurrenceFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function RecurrenceSection({
  task,
  recurrenceRules,
  onAddRule,
  onDeleteRule,
}: {
  task: Task;
  recurrenceRules: RecurrenceRule[];
  onAddRule: (rule: RecurrenceRule) => void;
  onDeleteRule: (id: string) => void;
}) {
  const existingRule = recurrenceRules.find(
    (r) => r.templateTaskId === task.id || r.id === task.recurringRuleId
  );
  // For generated instances, find the rule
  const ruleForInstance = task.recurringRuleId
    ? recurrenceRules.find((r) => r.id === task.recurringRuleId)
    : null;

  const [showSetup, setShowSetup] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("weekly");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  // If this is a generated instance, show info only
  if (ruleForInstance && task.recurringRuleId) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-primary/10 p-3">
        <Repeat className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <span className="text-xs text-muted-foreground font-medium">Recurring</span>
          <p className="text-sm text-foreground font-medium capitalize">{ruleForInstance.frequency}</p>
        </div>
      </div>
    );
  }

  // If rule already exists for this template task
  if (existingRule) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-primary/10 p-3">
        <Repeat className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <span className="text-xs text-muted-foreground font-medium">Recurring</span>
          <p className="text-sm text-foreground font-medium capitalize">
            {existingRule.frequency}
            {existingRule.daysOfWeek && existingRule.daysOfWeek.length > 0 && (
              <span className="text-muted-foreground text-xs ml-1">
                ({existingRule.daysOfWeek.map((d) => DAY_LABELS[d]).join(", ")})
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => onDeleteRule(existingRule.id)}
          className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-destructive active:bg-muted transition-colors"
        >
          Remove
        </button>
      </div>
    );
  }

  // No recurrence — show option to add
  if (!showSetup) {
    return (
      <FieldSection icon={<Repeat className="h-4 w-4" />} label="Recurring">
        <button
          onClick={() => setShowSetup(true)}
          className="rounded-lg bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
        >
          Make recurring...
        </button>
      </FieldSection>
    );
  }

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleCreate = () => {
    const today = new Date().toISOString().split("T")[0];
    const rule: RecurrenceRule = {
      id: `rr-${Date.now()}`,
      templateTaskId: task.id,
      frequency,
      daysOfWeek: (frequency === "weekly" || frequency === "biweekly") && selectedDays.length > 0
        ? selectedDays
        : undefined,
      startDate: today,
    };
    onAddRule(rule);
    setShowSetup(false);
  };

  return (
    <FieldSection icon={<Repeat className="h-4 w-4" />} label="Recurring">
      <div className="space-y-3 rounded-xl bg-secondary/50 p-3">
        <div className="flex flex-wrap gap-1.5">
          {FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFrequency(opt.value)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                frequency === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(frequency === "weekly" || frequency === "biweekly") && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5">Days of week</p>
            <div className="flex gap-1">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-[10px] font-medium transition-all",
                    selectedDays.includes(i)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleCreate}
            className="flex-1 rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground active:opacity-90 transition-opacity"
          >
            Set recurring
          </button>
          <button
            onClick={() => setShowSetup(false)}
            className="rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground active:bg-border transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </FieldSection>
  );
}

function FieldSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-muted-foreground">{icon}</div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      {children}
    </div>
  );
}
