import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { Task, TimeBlock } from "@/types/dayflow";
import { findNextAvailableSlot } from "@/lib/scheduling-utils";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function QuickAddTask({ open, onClose }: Props) {
  const { addTask, addTimeBlock, timeBlocks, preferences } = useDayFlow();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("work");
  const [priority, setPriority] = useState(3);

  const handleAdd = () => {
    if (!title.trim()) return;
    const task: Task = {
      id: `t-${Date.now()}`,
      title: title.trim(),
      categoryId,
      status: "active",
      priority,
      estimatedMinutes: preferences.defaultTaskDuration,
      canSplit: false,
      notes: "",
      preferredTime: "any",
      energyNeeded: "medium",
      recurring: false,
      createdAt: new Date().toISOString().split("T")[0],
      rolloverCount: 0,
      horizon: "today",
    };
    addTask(task);

    // Auto-schedule the task
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const durationHours = (task.estimatedMinutes || 30) / 60;
    const category = preferences.categories.find((c) => c.id === categoryId);
    const startHour = findNextAvailableSlot(timeBlocks, durationHours, task.preferredTime, today, currentHour, category?.schedulingWindow);
    const block: TimeBlock = {
      id: `b-manual-${task.id}`,
      taskId: task.id,
      title: task.title,
      categoryId: task.categoryId,
      date: today,
      startHour,
      durationHours,
      isFixed: false,
      type: "task",
    };
    addTimeBlock(block);

    setTitle("");
    setCategoryId("work");
    setPriority(3);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
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
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-card px-6 pt-4 pb-8"
            style={{ boxShadow: "0 -4px 24px hsl(220 20% 70% / 0.2)" }}
          >
            <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-border" />

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-display text-lg text-foreground">Add task</h2>
              <button aria-label="Close" onClick={onClose} className="tap-target flex items-center justify-center rounded-xl p-2 active:bg-secondary">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-4">
              <input
                autoFocus
                type="text"
                aria-label="Task title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="What do you need to do?"
                className="w-full rounded-xl bg-secondary px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
              />

              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium">Category</p>
                <div className="flex flex-wrap gap-1.5">
                  {preferences.categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryId(cat.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        categoryId === cat.id
                          ? "bg-foreground text-background"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium">Priority</p>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
                        priority === p
                          ? "bg-foreground text-background"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleAdd}
                disabled={!title.trim()}
                className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-40 transition-opacity active:opacity-90"
              >
                Add task
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
