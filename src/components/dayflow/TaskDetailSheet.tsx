import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { Task, CATEGORY_COLOR_MAP, EnergyLevel, TimeOfDay, DEFAULT_PROJECTS } from "@/types/dayflow";
import { mergeProjects } from "@/lib/project-utils";
import { X, Calendar, Clock, Tag, FileText, Zap, MapPin, Repeat, Timer, FolderOpen } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn, formatHour } from "@/lib/utils";

interface Props {
  task: Task | null;
  onClose: () => void;
}

const DURATION_CHIPS = [15, 30, 45, 60, 90, 120];
const PRIORITY_OPTIONS = [1, 2, 3, 4, 5];
const TIME_OPTIONS: TimeOfDay[] = ["morning", "afternoon", "evening", "any"];
const ENERGY_OPTIONS: EnergyLevel[] = ["low", "medium", "high"];

export default function TaskDetailSheet({ task, onClose }: Props) {
  const { getCategory, updateTask, dropTask, timeBlocks, preferences, customProjects } = useDayFlow();

  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(3);
  const [preferredTime, setPreferredTime] = useState<TimeOfDay>("any");
  const [energyNeeded, setEnergyNeeded] = useState<EnergyLevel>("medium");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState("work");
  const [project, setProject] = useState<string | undefined>();
  const [deadline, setDeadline] = useState<Date | undefined>();

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

  if (!task) return null;

  const cat = getCategory(categoryId);
  const dotColor = CATEGORY_COLOR_MAP[cat?.color || "teal"] || "bg-muted";

  // Find scheduled time block
  const scheduledBlock = timeBlocks.find((b) => b.taskId === task.id);

  // Projects for selected category
  const allProjects = mergeProjects(customProjects);
  const availableProjects = allProjects[categoryId] || [];

  const handleSave = () => {
    updateTask(task.id, {
      title: title.trim() || task.title,
      estimatedMinutes,
      priority,
      preferredTime,
      energyNeeded,
      notes,
      categoryId,
      project,
      deadline: deadline ? deadline.toISOString() : undefined,
    });
    onClose();
  };

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
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-display text-lg text-foreground bg-transparent outline-none w-full focus:ring-1 focus:ring-primary/30 rounded-lg px-1 -mx-1"
                />
              </div>
              <button aria-label="Close" onClick={onClose} className="tap-target flex items-center justify-center rounded-xl p-2 active:bg-secondary">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Scheduled Time (read-only) */}
              {scheduledBlock && (
                <div className="flex items-center gap-3 rounded-xl bg-primary/10 p-3">
                  <Timer className="h-4 w-4 text-primary" />
                  <div>
                    <span className="text-xs text-muted-foreground font-medium">Scheduled</span>
                    <p className="text-sm text-foreground font-medium">
                      {formatHour(scheduledBlock.startHour)} – {formatHour(scheduledBlock.startHour + scheduledBlock.durationHours)}
                    </p>
                  </div>
                </div>
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
                      onSelect={setDeadline}
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
                          // Reset project if switching category
                          if (c.id !== categoryId) setProject(undefined);
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
                      onClick={() => setProject(undefined)}
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
                        onClick={() => setProject(p)}
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
                      onClick={() => setPriority(p)}
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
                      onClick={() => setEstimatedMinutes(d)}
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
                      onClick={() => setPreferredTime(t)}
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
                      onClick={() => setEnergyNeeded(e)}
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

              {/* Recurring indicator */}
              {task.recurring && (
                <div className="flex items-center gap-3">
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium w-24">Recurring</span>
                  <span className="text-sm text-foreground">Yes</span>
                </div>
              )}

              {/* Notes */}
              <FieldSection icon={<FileText className="h-4 w-4" />} label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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

            {/* Actions */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSave}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground active:opacity-90 transition-opacity"
              >
                Save changes
              </button>
              <button
                onClick={handleDrop}
                className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-destructive active:bg-muted transition-colors"
              >
                Drop
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
