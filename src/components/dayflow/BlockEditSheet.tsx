import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { TimeBlock } from "@/types/dayflow";
import { X, Clock, Minus, Plus, Trash2, Calendar, ArrowLeft, ArrowRight } from "lucide-react";
import { formatHour } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface Props {
  block: TimeBlock | null;
  onClose: () => void;
}

const DURATION_CHIPS = [0.25, 0.5, 1, 1.5, 2, 3];

function formatBlockDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", year: "2-digit" });
}

export default function BlockEditSheet({ block, onClose }: Props) {
  const { updateTimeBlock, removeTimeBlock, moveBlockToDate } = useDayFlow();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startHour, setStartHour] = useState(9);
  const [durationHours, setDurationHours] = useState(1);
  const [isFixed, setIsFixed] = useState(false);

  useEffect(() => {
    if (block) {
      setTitle(block.title);
      setDate(block.date);
      setStartHour(block.startHour);
      setDurationHours(block.durationHours);
      setIsFixed(block.isFixed);
    }
  }, [block]);

  if (!block) return null;

  const todayStr = new Date().toISOString().split("T")[0];
  const isToday = date === todayStr;

  const handleSave = () => {
    // If date changed, move the block first
    if (date !== block.date) {
      moveBlockToDate(block.id, date);
    }
    updateTimeBlock(block.id, {
      title,
      startHour,
      durationHours,
      isFixed,
    });
    onClose();
  };

  const handleDelete = () => {
    removeTimeBlock(block.id);
    onClose();
  };

  const adjustStart = (delta: number) => {
    const next = Math.max(0, Math.min(23.75, startHour + delta));
    setStartHour(Math.round(next * 4) / 4);
  };

  const adjustDuration = (delta: number) => {
    const next = Math.max(0.25, Math.min(8, durationHours + delta));
    setDurationHours(Math.round(next * 4) / 4);
  };

  const moveByDays = (days: number) => {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split("T")[0]);
  };

  return (
    <AnimatePresence>
      {block && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl shadow-xl max-h-[80vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Edit Block</h2>
                <button onClick={onClose} className="p-1.5 rounded-lg active:bg-secondary">
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              {/* Title */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Date section */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  <Calendar className="inline h-3.5 w-3.5 mr-1" />Date
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-foreground flex-1">
                    {formatBlockDate(date)}
                  </span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {!isToday && (
                    <button
                      onClick={() => setDate(todayStr)}
                      className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground active:bg-border transition-colors"
                    >
                      <ArrowLeft className="h-3 w-3" /> Today
                    </button>
                  )}
                  <button
                    onClick={() => moveByDays(-1)}
                    className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground active:bg-border transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3" /> Prev
                  </button>
                  <button
                    onClick={() => moveByDays(1)}
                    className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground active:bg-border transition-colors"
                  >
                    Next <ArrowRight className="h-3 w-3" />
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
                        selected={new Date(date + "T12:00:00")}
                        onSelect={(d) => {
                          if (d) {
                            setDate(d.toISOString().split("T")[0]);
                          }
                        }}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Start time */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  <Clock className="inline h-3.5 w-3.5 mr-1" />Time
                </label>
                <div className="flex items-center gap-3">
                  <button onClick={() => adjustStart(-0.25)} className="p-1.5 rounded-lg border border-border active:bg-secondary">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-medium min-w-[120px] text-center">
                    {formatHour(startHour)} – {formatHour(startHour + durationHours)}
                  </span>
                  <button onClick={() => adjustStart(0.25)} className="p-1.5 rounded-lg border border-border active:bg-secondary">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {DURATION_CHIPS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDurationHours(d)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        durationHours === d
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {d >= 1 ? `${d}h` : `${d * 60}m`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => adjustDuration(-0.25)} className="p-1.5 rounded-lg border border-border active:bg-secondary">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-medium min-w-[80px] text-center">
                    {durationHours >= 1 ? `${durationHours}h` : `${durationHours * 60}m`}
                  </span>
                  <button onClick={() => adjustDuration(0.25)} className="p-1.5 rounded-lg border border-border active:bg-secondary">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Fixed toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Fixed / Pinned</span>
                <button
                  onClick={() => setIsFixed(!isFixed)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${isFixed ? "bg-primary" : "bg-secondary"}`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${
                      isFixed ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 pb-4">
                <button
                  onClick={handleDelete}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-destructive/30 py-2.5 text-sm font-medium text-destructive active:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground active:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
