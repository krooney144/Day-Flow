import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { Task, CATEGORY_COLOR_MAP, CATEGORY_COLOR_BG_MAP, CATEGORY_TEXT_COLOR_MAP } from "@/types/dayflow";
import { Plus, Check, CheckCircle2, ChevronDown, Pin } from "lucide-react";
import { formatHour } from "@/lib/utils";
import TaskDetailSheet from "@/components/dayflow/TaskDetailSheet";
import QuickAddTask from "@/components/dayflow/QuickAddTask";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTaskScheduleSync } from "@/hooks/useTaskScheduleSync";

type TabView = "active" | "fixed" | "completed";
type SortMode = "priority" | "category" | "manual";

const SORT_LABELS: Record<SortMode, string> = {
  priority: "Priority",
  category: "Category",
  manual: "Manual",
};

export default function TasksPage() {
  const { tasks, getCategory, toggleTaskComplete, preferences } = useDayFlow();
  useTaskScheduleSync();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>("priority");
  const [tabView, setTabView] = useState<TabView>("active");

  const { timeBlocks: allTimeBlocks } = useDayFlow();

  // Compute which tasks have fixed blocks in the next 14 days
  const fixedTaskIds = useMemo(() => {
    const today = new Date();
    const twoWeeksOut = new Date();
    twoWeeksOut.setDate(today.getDate() + 14);
    const todayStr = today.toISOString().split("T")[0];
    const cutoffStr = twoWeeksOut.toISOString().split("T")[0];
    const ids = new Set<string>();
    allTimeBlocks.forEach((b) => {
      if (b.isFixed && b.taskId && b.date >= todayStr && b.date <= cutoffStr) {
        ids.add(b.taskId);
      }
    });
    return ids;
  }, [allTimeBlocks]);

  const filtered = useMemo(() => {
    if (tabView === "completed") {
      let list = tasks.filter((t) => t.status === "completed" && t.status !== "dropped");
      if (filterCat) list = list.filter((t) => t.categoryId === filterCat);
      return list;
    }
    if (tabView === "fixed") {
      let list = tasks.filter((t) => t.status === "active" && fixedTaskIds.has(t.id));
      if (filterCat) list = list.filter((t) => t.categoryId === filterCat);
      // Sort by scheduled date
      list.sort((a, b) => {
        const blockA = allTimeBlocks.find((bl) => bl.taskId === a.id);
        const blockB = allTimeBlocks.find((bl) => bl.taskId === b.id);
        if (!blockA || !blockB) return 0;
        return blockA.date.localeCompare(blockB.date) || blockA.startHour - blockB.startHour;
      });
      return list;
    }
    // active tab
    let list = tasks.filter((t) => t.status === "active" && t.status !== "dropped");
    if (filterCat) list = list.filter((t) => t.categoryId === filterCat);
    if (sortBy === "priority") {
      list.sort((a, b) => a.priority - b.priority);
    } else if (sortBy === "category") {
      list.sort((a, b) => a.categoryId.localeCompare(b.categoryId));
    }
    return list;
  }, [tasks, filterCat, sortBy, tabView, fixedTaskIds, allTimeBlocks]);

  const completedCount = useMemo(() => tasks.filter(t => t.status === "completed").length, [tasks]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-display text-xl text-foreground">Tasks</h1>
          {/* Sort popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-muted-foreground bg-secondary active:bg-muted transition-colors">
                {SORT_LABELS[sortBy]}
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSortBy(mode)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    sortBy === mode ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
                  }`}
                >
                  {SORT_LABELS[mode]}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {/* Active / Fixed / Completed toggle */}
        <div className="flex gap-1 rounded-xl bg-secondary p-1 mb-3">
          <button
            onClick={() => setTabView("active")}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
              tabView === "active" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setTabView("fixed")}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              tabView === "fixed" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Pin className="h-3 w-3" />
            Fixed{fixedTaskIds.size > 0 && ` (${fixedTaskIds.size})`}
          </button>
          <button
            onClick={() => setTabView("completed")}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              tabView === "completed" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <CheckCircle2 className="h-3 w-3" />
            Done{completedCount > 0 && ` (${completedCount})`}
          </button>
        </div>

        {/* Category filter pills — color-coded */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setFilterCat(null)}
            className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-all ${
              !filterCat ? "bg-foreground text-background" : "bg-secondary text-secondary-foreground"
            }`}
          >
            All
          </button>
          {preferences.categories.map((cat) => {
            const isActive = filterCat === cat.id;
            const colorBg = CATEGORY_COLOR_BG_MAP[cat.color] || "bg-secondary";
            const colorDot = CATEGORY_COLOR_MAP[cat.color] || "bg-muted";
            const textColor = CATEGORY_TEXT_COLOR_MAP[cat.color] || "text-secondary-foreground";
            return (
              <button
                key={cat.id}
                onClick={() => setFilterCat(filterCat === cat.id ? null : cat.id)}
                className={`shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition-all flex items-center gap-1.5 ${
                  isActive
                    ? `${colorBg} ${textColor} ring-1 ring-current`
                    : `${colorBg} ${textColor}`
                }`}
              >
                <div className={`h-2 w-2 rounded-full ${colorDot}`} />
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24">
        <div className="space-y-1.5">
          <AnimatePresence>
            {filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onTap={() => setSelectedTask(task)}
                onToggle={() => toggleTaskComplete(task.id)}
              />
            ))}
          </AnimatePresence>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              {tabView === "completed" ? "No completed tasks yet" : tabView === "fixed" ? "No fixed tasks in the next 2 weeks" : "No tasks yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {tabView === "active" ? "Tap + to add one, or use the Planner" : tabView === "fixed" ? "Meetings and pinned events show here" : "Complete tasks to see them here"}
            </p>
          </div>
        )}
      </div>

      {/* FAB */}
      {tabView === "active" && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed bottom-24 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg active:scale-95 transition-transform"
        >
          <Plus className="h-5 w-5 text-primary-foreground" />
        </button>
      )}

      <TaskDetailSheet task={selectedTask} onClose={() => setSelectedTask(null)} />
      <QuickAddTask open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}


function TaskRow({
  task,
  onTap,
  onToggle,
}: {
  task: Task;
  onTap: () => void;
  onToggle: () => void;
}) {
  const { getCategory, timeBlocks } = useDayFlow();
  const cat = getCategory(task.categoryId);
  const colorKey = cat?.color || "teal";
  const bgClass = CATEGORY_COLOR_BG_MAP[colorKey] || "bg-secondary";
  const isComplete = task.status === "completed";

  // Find scheduled time block for this task
  const scheduledBlock = timeBlocks.find((b) => b.taskId === task.id);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className={`rounded-xl p-3 flex items-center gap-3 cursor-pointer active:opacity-80 transition-opacity ${bgClass}`}
      onClick={onTap}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${
          isComplete
            ? "bg-primary border-primary"
            : "border-border bg-card"
        }`}
      >
        {isComplete && <Check className="h-3 w-3 text-primary-foreground" />}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            isComplete ? "line-through text-muted-foreground" : "text-foreground"
          }`}
        >
          {task.title}
        </p>
        {scheduledBlock && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {new Date(scheduledBlock.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })}
            {" "}
            {formatHour(scheduledBlock.startHour)} – {formatHour(scheduledBlock.startHour + scheduledBlock.durationHours)}
            {scheduledBlock.isFixed && " 📌"}
          </p>
        )}
      </div>

      
    </motion.div>
  );
}
