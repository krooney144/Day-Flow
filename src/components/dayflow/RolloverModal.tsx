import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { CATEGORY_COLOR_MAP } from "@/types/dayflow";
import { Check, ArrowRight, X } from "lucide-react";

export default function RolloverModal() {
  const { getRolloverTasks, getCategory, updateTask, setHasSeenRollover, hasSeenRollover, lastOpenDate } = useDayFlow();
  const today = new Date().toISOString().split("T")[0];
  const tasks = getRolloverTasks();

  const show = !hasSeenRollover && lastOpenDate !== today && tasks.length > 0;

  if (!show) return null;

  const handleAction = (taskId: string, action: "completed" | "keep" | "defer" | "drop") => {
    switch (action) {
      case "completed":
        updateTask(taskId, { status: "completed" });
        break;
      case "keep":
        updateTask(taskId, { rolloverCount: 0 });
        break;
      case "defer":
        // Keep active, increase rollover
        break;
      case "drop":
        updateTask(taskId, { status: "dropped" });
        break;
    }
  };

  const dismiss = () => setHasSeenRollover(true);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/15 backdrop-blur-sm"
        onClick={dismiss}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-t-2xl bg-card px-6 pt-4 pb-8"
          style={{ boxShadow: "0 -4px 24px hsl(220 20% 70% / 0.2)" }}
        >
          <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-border" />

          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-display text-lg text-foreground">Review yesterday</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Let's clear up {tasks.length} unfinished {tasks.length === 1 ? "task" : "tasks"}.
              </p>
            </div>
            <button onClick={dismiss} className="tap-target flex items-center justify-center rounded-xl p-2 active:bg-secondary">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-3">
            {tasks.map((task) => {
              const cat = getCategory(task.categoryId);
              const dotColor = CATEGORY_COLOR_MAP[cat?.color || "teal"] || "bg-muted";
              return (
                <div key={task.id} className="surface-card p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`cat-dot ${dotColor}`} />
                    <span className="text-sm font-medium text-foreground flex-1 truncate">{task.title}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleAction(task.id, "completed")}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-secondary py-1.5 text-xs font-medium text-secondary-foreground active:bg-border"
                    >
                      <Check className="h-3 w-3" /> Done
                    </button>
                    <button
                      onClick={() => handleAction(task.id, "keep")}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-secondary py-1.5 text-xs font-medium text-secondary-foreground active:bg-border"
                    >
                      Keep
                    </button>
                    <button
                      onClick={() => handleAction(task.id, "defer")}
                      className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-secondary py-1.5 text-xs font-medium text-secondary-foreground active:bg-border"
                    >
                      <ArrowRight className="h-3 w-3" /> Defer
                    </button>
                    <button
                      onClick={() => handleAction(task.id, "drop")}
                      className="flex items-center justify-center rounded-lg bg-secondary px-2 py-1.5 text-xs font-medium text-destructive active:bg-border"
                    >
                      Drop
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={dismiss}
            className="w-full mt-4 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground active:opacity-90 transition-opacity"
          >
            Start my day
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
