import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { CATEGORY_COLOR_MAP, CATEGORY_COLOR_BG_MAP, TimeBlock, Task } from "@/types/dayflow";
import { ChevronLeft, ChevronRight, Check, ArrowRight, Pencil } from "lucide-react";
import { formatHour } from "@/lib/utils";
import TaskDetailSheet from "@/components/dayflow/TaskDetailSheet";

const HOUR_HEIGHT = 64; // px per hour
const START_HOUR = 0;
const END_HOUR = 24;
const SNAP_MINUTES = 15;

// Desktop breakpoint for responsive 3-day view
const DESKTOP_MIN_WIDTH = 768;

type ScheduleView = "day" | "3day" | "week";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= DESKTOP_MIN_WIDTH : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export default function SchedulePage() {
  const { getBlocksForDate, getCategory, preferences, tasks } = useDayFlow();
  const [view, setView] = useState<ScheduleView>("day");
  const [dateOffset, setDateOffset] = useState(0);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const currentDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dateOffset);
    return d;
  }, [dateOffset]);

  const dateStr = currentDate.toISOString().split("T")[0];

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  const handleEditTask = useCallback((taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (task) setEditingTask(task);
  }, [tasks]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-display text-xl text-foreground">
              {dateOffset === 0 ? "Today" : formatDate(currentDate)}
            </h1>
            {dateOffset === 0 && (
              <p className="text-sm text-muted-foreground">{formatDate(currentDate)}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label="Previous day"
              onClick={() => setDateOffset((d) => d - 1)}
              className="tap-target flex items-center justify-center rounded-xl p-2 active:bg-secondary"
            >
              <ChevronLeft className="h-5 w-5 text-muted-foreground" />
            </button>
            <button
              aria-label="Go to today"
              onClick={() => setDateOffset(0)}
              className="tap-target rounded-xl px-3 py-1.5 text-sm font-medium text-primary active:bg-secondary"
            >
              Today
            </button>
            <button
              aria-label="Next day"
              onClick={() => setDateOffset((d) => d + 1)}
              className="tap-target flex items-center justify-center rounded-xl p-2 active:bg-secondary"
            >
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 rounded-xl bg-secondary p-1">
          {(["day", "3day", "week"] as ScheduleView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ${
                view === v
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {v === "day" ? "Day" : v === "3day" ? "3 Day" : "Week"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {view === "day" && (
          <DayView
            dateStr={dateStr}
            onEditTask={handleEditTask}
            onSwipePrev={() => setDateOffset((d) => d - 1)}
            onSwipeNext={() => setDateOffset((d) => d + 1)}
          />
        )}
        {view === "3day" && <ThreeDayView baseDate={currentDate} onEditTask={handleEditTask} />}
        {view === "week" && (
          <WeekView
            baseDate={currentDate}
            onEditTask={handleEditTask}
            onNavigateToDay={(d) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const target = new Date(d);
              target.setHours(0, 0, 0, 0);
              const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              setDateOffset(diff);
              setView("day");
            }}
          />
        )}
      </div>

      {/* Task Detail Sheet */}
      <TaskDetailSheet task={editingTask} onClose={() => setEditingTask(null)} />
    </div>
  );
}

// Compute overlap columns for blocks
interface LayoutBlock {
  block: TimeBlock;
  column: number;
  totalColumns: number;
}

function computeOverlapLayout(blocks: TimeBlock[]): LayoutBlock[] {
  if (blocks.length === 0) return [];

  const sorted = [...blocks].sort((a, b) => a.startHour - b.startHour || a.id.localeCompare(b.id));
  const result: LayoutBlock[] = [];
  const groups: TimeBlock[][] = [];

  // Group overlapping blocks
  let currentGroup: TimeBlock[] = [sorted[0]];
  let groupEnd = sorted[0].startHour + sorted[0].durationHours;

  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i];
    if (b.startHour < groupEnd) {
      currentGroup.push(b);
      groupEnd = Math.max(groupEnd, b.startHour + b.durationHours);
    } else {
      groups.push(currentGroup);
      currentGroup = [b];
      groupEnd = b.startHour + b.durationHours;
    }
  }
  groups.push(currentGroup);

  for (const group of groups) {
    const totalColumns = group.length;
    group.forEach((block, col) => {
      result.push({ block, column: col, totalColumns });
    });
  }

  return result;
}

function snapToGrid(hour: number): number {
  const increments = 60 / SNAP_MINUTES; // 4 per hour
  return Math.round(hour * increments) / increments;
}

/** Scroll position for the day view: center on current time with 3h above, 4h below */
function getScrollForCurrentTime(containerHeight: number): number {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  // Show 3 hours before current time at the top
  const targetTopHour = Math.max(0, currentHour - 3);
  return targetTopHour * HOUR_HEIGHT;
}

function DayView({ dateStr, onEditTask, onSwipePrev, onSwipeNext }: {
  dateStr: string;
  onEditTask: (taskId: string) => void;
  onSwipePrev: () => void;
  onSwipeNext: () => void;
}) {
  const { getBlocksForDate, getCategory, toggleTaskComplete, tasks, updateTimeBlock, moveBlockToDate, displaceBlock } = useDayFlow();
  const blocks = getBlocksForDate(dateStr);
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isToday = dateStr === new Date().toISOString().split("T")[0];
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPreviewHour, setDragPreviewHour] = useState<number | null>(null);

  // Auto-scroll: center on current time if today, otherwise show ~8 AM
  useEffect(() => {
    if (scrollRef.current) {
      if (isToday) {
        scrollRef.current.scrollTop = getScrollForCurrentTime(scrollRef.current.clientHeight);
      } else {
        scrollRef.current.scrollTop = 8 * HOUR_HEIGHT; // 8 AM for non-today
      }
    }
  }, [dateStr, isToday]);

  const isTaskCompleted = (taskId?: string) => {
    if (!taskId) return false;
    return tasks.find(t => t.id === taskId)?.status === "completed";
  };

  const layoutBlocks = useMemo(() => computeOverlapLayout(blocks), [blocks]);

  const getHourFromPointer = useCallback((clientY: number): number => {
    if (!containerRef.current) return START_HOUR;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const hour = START_HOUR + relativeY / HOUR_HEIGHT;
    return snapToGrid(hour);
  }, []);

  const cleanupRef = useRef<(() => void) | null>(null);

  // Clean up drag listeners if component unmounts mid-drag
  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  // Swipe detection for day navigation
  const swipeStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - swipeStartRef.current.x;
    const dy = touch.clientY - swipeStartRef.current.y;
    const dt = Date.now() - swipeStartRef.current.t;
    swipeStartRef.current = null;

    // Only trigger if horizontal swipe is dominant and fast enough
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 400) {
      if (dx > 0) onSwipePrev();
      else onSwipeNext();
    }
  }, [onSwipePrev, onSwipeNext]);

  const handlePointerDown = useCallback((blockId: string, e: React.PointerEvent) => {
    if (blocks.find(b => b.id === blockId)?.isFixed) return;
    e.preventDefault();
    setDraggingId(blockId);
    const hour = getHourFromPointer(e.clientY);
    setDragPreviewHour(hour);

    const onMove = (ev: PointerEvent) => {
      const h = getHourFromPointer(ev.clientY);
      const block = blocks.find(b => b.id === blockId);
      if (block) {
        const clamped = Math.max(START_HOUR, Math.min(END_HOUR - block.durationHours, h));
        setDragPreviewHour(clamped);
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      cleanupRef.current = null;
    };

    const onUp = (ev: PointerEvent) => {
      const h = getHourFromPointer(ev.clientY);
      const block = blocks.find(b => b.id === blockId);
      if (block) {
        const clamped = Math.max(START_HOUR, Math.min(END_HOUR - block.durationHours, h));
        updateTimeBlock(blockId, { startHour: clamped });
        displaceBlock(blockId);
      }
      setDraggingId(null);
      setDragPreviewHour(null);
      cleanup();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    cleanupRef.current = cleanup;
  }, [blocks, getHourFromPointer, updateTimeBlock, displaceBlock]);

  return (
    <div
      ref={scrollRef}
      className="relative mt-2 overflow-y-auto"
      style={{ height: "calc(100vh - 200px)" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div ref={containerRef} className="relative select-none" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}>
        {/* Hour lines */}
        {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => {
          const hour = START_HOUR + i;
          const ampm = hour < 12 || hour === 24 ? "AM" : "PM";
          const display = hour === 0 || hour === 24 ? 12 : hour > 12 ? hour - 12 : hour;
          return (
            <div
              key={hour}
              className="absolute left-0 right-0 flex items-start"
              style={{ top: i * HOUR_HEIGHT }}
            >
              <span className="text-meta text-[10px] text-muted-foreground w-12 -mt-1.5 text-right pr-3">
                {display} {ampm}
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
          );
        })}

        {/* 15-min gridlines (subtle) */}
        {Array.from({ length: (END_HOUR - START_HOUR) * 4 }, (_, i) => {
          if (i % 4 === 0) return null;
          return (
            <div
              key={`q-${i}`}
              className="absolute left-12 right-0 border-t border-border/20"
              style={{ top: (i / 4) * HOUR_HEIGHT }}
            />
          );
        })}

        {/* Current time line */}
        {isToday && currentHour >= START_HOUR && currentHour <= END_HOUR && (
          <div
            className="absolute left-12 right-0 z-20 flex items-center"
            style={{ top: (currentHour - START_HOUR) * HOUR_HEIGHT }}
          >
            <div className="h-2 w-2 rounded-full bg-primary -ml-1" />
            <div className="flex-1 h-[1.5px] bg-primary" />
          </div>
        )}

        {/* Drag preview ghost */}
        {draggingId && dragPreviewHour !== null && (() => {
          const block = blocks.find(b => b.id === draggingId);
          if (!block) return null;
          const top = (dragPreviewHour - START_HOUR) * HOUR_HEIGHT;
          const height = Math.max(block.durationHours * HOUR_HEIGHT - 2, 24);
          return (
            <div
              className="absolute left-12 right-0 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 pointer-events-none z-10"
              style={{ top, height }}
            />
          );
        })()}

        {/* Time blocks */}
        {layoutBlocks.map(({ block, column, totalColumns }) => (
          <ScheduleBlock
            key={block.id}
            block={block}
            column={column}
            totalColumns={totalColumns}
            completed={isTaskCompleted(block.taskId)}
            onToggle={block.taskId ? () => toggleTaskComplete(block.taskId!) : undefined}
            isDragging={draggingId === block.id}
            dragPreviewHour={draggingId === block.id ? dragPreviewHour : null}
            onPointerDown={(e) => handlePointerDown(block.id, e)}
            onMoveToTomorrow={!block.isFixed ? () => {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              moveBlockToDate(block.id, tomorrow.toISOString().split("T")[0]);
            } : undefined}
            onEdit={block.taskId ? () => onEditTask(block.taskId!) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function ScheduleBlock({
  block,
  column,
  totalColumns,
  completed,
  onToggle,
  isDragging,
  dragPreviewHour,
  onPointerDown,
  onMoveToTomorrow,
  onEdit,
}: {
  block: TimeBlock;
  column: number;
  totalColumns: number;
  completed?: boolean;
  onToggle?: () => void;
  isDragging: boolean;
  dragPreviewHour: number | null;
  onPointerDown: (e: React.PointerEvent) => void;
  onMoveToTomorrow?: () => void;
  onEdit?: () => void;
}) {
  const { getCategory } = useDayFlow();
  const cat = getCategory(block.categoryId);
  const colorKey = cat?.color || "teal";

  const displayHour = isDragging && dragPreviewHour !== null ? dragPreviewHour : block.startHour;
  const top = (displayHour - START_HOUR) * HOUR_HEIGHT;
  const height = Math.max(block.durationHours * HOUR_HEIGHT - 2, 24);

  // Overlap layout
  const widthPercent = 100 / totalColumns;
  const leftPercent = column * widthPercent;
  const leftCalc = `calc(48px + (100% - 48px) * ${leftPercent / 100})`;
  const widthCalc = `calc((100% - 48px) * ${widthPercent / 100})`;

  const bgClass =
    block.type === "meal"
      ? "bg-secondary"
      : block.type === "break" || block.type === "transition"
      ? "bg-muted"
      : CATEGORY_COLOR_BG_MAP[colorKey] || "bg-secondary";

  const dotClass = CATEGORY_COLOR_MAP[colorKey] || "bg-muted-foreground";

  const typeIcon =
    block.type === "meal" ? "🍽" : block.type === "break" ? "☕" : block.isFixed ? "📌" : "";

  return (
    <div
      className={`absolute rounded-xl p-2.5 transition-shadow touch-none ${bgClass} ${
        completed ? "opacity-40" : ""
      } ${isDragging ? "z-30 shadow-lg scale-[1.02]" : ""} ${
        block.isFixed ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{
        top,
        height,
        left: totalColumns > 1 ? leftCalc : 48,
        width: totalColumns > 1 ? widthCalc : "calc(100% - 48px)",
      }}
      onPointerDown={block.isFixed ? undefined : onPointerDown}
    >
      <div className="flex items-start gap-2 h-full">
        {/* Drag handle — larger touch target */}
        {!block.isFixed && (
          <div className="flex flex-col gap-0.5 opacity-30 mt-1 shrink-0 py-1 px-1 -ml-1">
            <div className="h-[2px] w-4 rounded bg-muted-foreground" />
            <div className="h-[2px] w-4 rounded bg-muted-foreground" />
            <div className="h-[2px] w-4 rounded bg-muted-foreground" />
          </div>
        )}

        {block.type === "task" && onToggle && (
          <button
            aria-label={completed ? `Mark "${block.title}" incomplete` : `Complete "${block.title}"`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`flex h-5 w-5 mt-0.5 shrink-0 items-center justify-center rounded border-[1.5px] transition-all ${
              completed ? "bg-primary border-primary" : "border-muted-foreground/40 bg-card/50"
            }`}
          >
            {completed && <Check className="h-3 w-3 text-primary-foreground" />}
          </button>
        )}
        {block.type !== "task" && <div className={`cat-dot mt-1.5 ${dotClass}`} />}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium truncate ${completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {typeIcon} {block.title}
          </p>
          {height > 32 && (
            <p className="text-meta text-[10px] text-muted-foreground mt-0.5">
              {formatHour(displayHour)} – {formatHour(displayHour + block.durationHours)}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Edit button — shown for ALL blocks with a taskId, including fixed */}
          {onEdit && (
            <button
              aria-label="Edit task"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex items-center justify-center rounded-lg p-1.5 opacity-50 hover:opacity-100 active:bg-secondary/50 transition-opacity"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          {onMoveToTomorrow && (
            <button
              aria-label="Move to tomorrow"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onMoveToTomorrow();
              }}
              className="flex items-center justify-center rounded-lg p-1.5 opacity-50 hover:opacity-100 active:bg-secondary/50 transition-opacity"
            >
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Compact block for the 3-day grid view on desktop ───
function ThreeDayGridBlock({
  block,
  column,
  totalColumns,
  hourHeight,
  startHour,
  onEdit,
}: {
  block: TimeBlock;
  column: number;
  totalColumns: number;
  hourHeight: number;
  startHour: number;
  onEdit?: () => void;
}) {
  const { getCategory } = useDayFlow();
  const cat = getCategory(block.categoryId);
  const colorKey = cat?.color || "teal";

  const top = (block.startHour - startHour) * hourHeight;
  const height = Math.max(block.durationHours * hourHeight - 2, 18);

  const widthPercent = 100 / totalColumns;
  const leftPercent = column * widthPercent;

  const bgClass =
    block.type === "meal"
      ? "bg-secondary"
      : block.type === "break" || block.type === "transition"
      ? "bg-muted"
      : CATEGORY_COLOR_BG_MAP[colorKey] || "bg-secondary";

  const typeIcon = block.isFixed ? "📌" : "";

  return (
    <div
      className={`absolute rounded-lg px-1.5 py-1 overflow-hidden ${bgClass} ${
        onEdit ? "cursor-pointer active:opacity-80" : ""
      }`}
      style={{
        top,
        height,
        left: totalColumns > 1 ? `${leftPercent}%` : 0,
        width: totalColumns > 1 ? `${widthPercent}%` : "100%",
      }}
      onClick={onEdit}
    >
      <p className="text-[10px] font-medium text-foreground truncate leading-tight">
        {typeIcon} {block.title}
      </p>
      {height > 26 && (
        <p className="text-[9px] text-muted-foreground leading-tight">
          {formatHour(block.startHour)}
        </p>
      )}
    </div>
  );
}

function ThreeDayView({ baseDate, onEditTask }: { baseDate: Date; onEditTask: (taskId: string) => void }) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <ThreeDayGridView baseDate={baseDate} onEditTask={onEditTask} />;
  }
  return <ThreeDayCompactView baseDate={baseDate} onEditTask={onEditTask} />;
}

// ─── Desktop: side-by-side hourly grids ───
const GRID_START = 8;   // Default visible start
const GRID_END = 18;    // Default visible end
const GRID_HOUR_HEIGHT = 48; // Slightly shorter per-hour for 3 columns

function ThreeDayGridView({ baseDate, onEditTask }: { baseDate: Date; onEditTask: (taskId: string) => void }) {
  const { getBlocksForDate, getCategory } = useDayFlow();
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = [0, 1, 2].map((offset) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset);
    return d;
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;

  // Full range is 0-24, but we scroll to show 8-18 by default
  const fullStartHour = 0;
  const fullEndHour = 24;
  const totalHours = fullEndHour - fullStartHour;

  // Auto-scroll to show 8 AM at top (or current time - 1h if today)
  useEffect(() => {
    if (scrollRef.current) {
      const isShowingToday = days.some(d => d.toISOString().split("T")[0] === todayStr);
      if (isShowingToday) {
        const scrollTo = Math.max(0, (currentHour - 3)) * GRID_HOUR_HEIGHT;
        scrollRef.current.scrollTop = scrollTo;
      } else {
        scrollRef.current.scrollTop = GRID_START * GRID_HOUR_HEIGHT;
      }
    }
  }, [baseDate.toISOString()]);

  return (
    <div className="mt-2">
      {/* Day headers */}
      <div className="flex gap-1 mb-1">
        <div className="w-10 shrink-0" /> {/* Gutter for time labels */}
        {days.map((day) => {
          const dateStr = day.toISOString().split("T")[0];
          const isToday = dateStr === todayStr;
          return (
            <div
              key={dateStr}
              className={`flex-1 text-center rounded-lg py-1.5 ${isToday ? "bg-primary/10" : "bg-secondary"}`}
            >
              <p className={`text-[10px] font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </p>
              <p className={`text-[10px] ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
            </div>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ height: "calc(100vh - 240px)" }}
      >
        <div className="flex gap-1" style={{ height: totalHours * GRID_HOUR_HEIGHT }}>
          {/* Time labels column */}
          <div className="w-10 shrink-0 relative">
            {Array.from({ length: totalHours + 1 }, (_, i) => {
              const hour = fullStartHour + i;
              const ampm = hour < 12 || hour === 24 ? "AM" : "PM";
              const display = hour === 0 || hour === 24 ? 12 : hour > 12 ? hour - 12 : hour;
              return (
                <div
                  key={hour}
                  className="absolute left-0 right-0"
                  style={{ top: i * GRID_HOUR_HEIGHT }}
                >
                  <span className="text-[9px] text-muted-foreground leading-none">
                    {display}{ampm}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dateStr = day.toISOString().split("T")[0];
            const blocks = getBlocksForDate(dateStr);
            const isToday = dateStr === todayStr;
            const layoutBlocks = computeOverlapLayout(blocks);

            return (
              <div
                key={dateStr}
                className={`flex-1 relative border-l border-border/30 ${
                  isToday ? "bg-primary/[0.03]" : ""
                }`}
              >
                {/* Hour gridlines */}
                {Array.from({ length: totalHours }, (_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-border/30"
                    style={{ top: i * GRID_HOUR_HEIGHT }}
                  />
                ))}

                {/* Current time line */}
                {isToday && (
                  <div
                    className="absolute left-0 right-0 z-10 flex items-center"
                    style={{ top: (currentHour - fullStartHour) * GRID_HOUR_HEIGHT }}
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <div className="flex-1 h-[1px] bg-primary" />
                  </div>
                )}

                {/* Blocks */}
                {layoutBlocks.map(({ block, column, totalColumns }) => (
                  <ThreeDayGridBlock
                    key={block.id}
                    block={block}
                    column={column}
                    totalColumns={totalColumns}
                    hourHeight={GRID_HOUR_HEIGHT}
                    startHour={fullStartHour}
                    onEdit={block.taskId ? () => onEditTask(block.taskId!) : undefined}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile: compact card list (unchanged) ───
function ThreeDayCompactView({ baseDate, onEditTask }: { baseDate: Date; onEditTask: (taskId: string) => void }) {
  const { getBlocksForDate, getCategory } = useDayFlow();

  const days = [0, 1, 2].map((offset) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + offset);
    return d;
  });

  return (
    <div className="mt-2 space-y-3">
      {days.map((day) => {
        const dateStr = day.toISOString().split("T")[0];
        const blocks = getBlocksForDate(dateStr).filter(b => b.type === "task" || b.type === "event");
        const isToday = dateStr === new Date().toISOString().split("T")[0];
        return (
          <div
            key={dateStr}
            className={`surface-card p-3 ${isToday ? "ring-1 ring-primary/30" : ""}`}
          >
            <p className={`text-xs font-semibold mb-2 ${isToday ? "text-primary" : "text-foreground"}`}>
              {day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              {isToday && <span className="ml-2 text-primary text-meta">Today</span>}
            </p>
            {blocks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tasks scheduled</p>
            ) : (
              <div className="space-y-1.5">
                {blocks.map((block) => {
                  const cat = getCategory(block.categoryId);
                  const colorKey = cat?.color || "teal";
                  const dotClass = CATEGORY_COLOR_MAP[colorKey] || "bg-muted";
                  const bgClass = CATEGORY_COLOR_BG_MAP[colorKey] || "bg-secondary";
                  return (
                    <div
                      key={block.id}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${bgClass} ${block.taskId ? "cursor-pointer active:opacity-80" : ""}`}
                      onClick={block.taskId ? () => onEditTask(block.taskId!) : undefined}
                    >
                      <div className={`cat-dot ${dotClass}`} />
                      <span className="text-xs font-medium text-foreground truncate flex-1">{block.title}</span>
                      <span className="text-meta text-[10px] text-muted-foreground shrink-0">
                        {formatHour(block.startHour)}
                      </span>
                      {block.taskId && (
                        <Pencil className="h-3 w-3 text-muted-foreground opacity-40 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ baseDate, onEditTask, onNavigateToDay }: {
  baseDate: Date;
  onEditTask: (taskId: string) => void;
  onNavigateToDay: (date: Date) => void;
}) {
  const { getBlocksForDate, getCategory } = useDayFlow();

  // Start from current day (rolling 7-day window)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="mt-2 space-y-2">
      {days.map((day) => {
        const dateStr = day.toISOString().split("T")[0];
        const blocks = getBlocksForDate(dateStr).filter((b) => b.type === "task" || b.type === "event");
        const isToday = dateStr === new Date().toISOString().split("T")[0];
        return (
          <div
            key={dateStr}
            className={`surface-card p-3 cursor-pointer active:opacity-90 transition-opacity ${isToday ? "ring-1 ring-primary/30" : ""}`}
            onClick={() => onNavigateToDay(day)}
          >
            <div className="flex items-center justify-between mb-1.5">
              <p
                className={`text-xs font-semibold ${
                  isToday ? "text-primary" : "text-foreground"
                }`}
              >
                {day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                {isToday && <span className="ml-2 text-primary text-meta">Today</span>}
              </p>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-40" />
            </div>
            {blocks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tasks scheduled</p>
            ) : (
              <div className="space-y-1">
                {blocks.slice(0, 4).map((block) => {
                  const cat = getCategory(block.categoryId);
                  const dotClass = CATEGORY_COLOR_MAP[cat?.color || "teal"] || "bg-muted";
                  return (
                    <div
                      key={block.id}
                      className="flex items-center gap-2"
                      onClick={(e) => {
                        if (block.taskId) {
                          e.stopPropagation();
                          onEditTask(block.taskId);
                        }
                      }}
                    >
                      <div className={`cat-dot ${dotClass}`} />
                      <span className="text-xs text-foreground truncate">{block.title}</span>
                      <span className="text-meta text-[10px] text-muted-foreground ml-auto">
                        {formatHour(block.startHour)}
                      </span>
                      {block.taskId && (
                        <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-40 shrink-0" />
                      )}
                    </div>
                  );
                })}
                {blocks.length > 4 && (
                  <p className="text-[10px] text-muted-foreground">+{blocks.length - 4} more</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
