import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { CATEGORY_COLOR_MAP, Category, TimeOfDay } from "@/types/dayflow";
import { ChevronRight, ChevronDown, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => i); // 0-24
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const TIME_OF_DAY_OPTIONS: TimeOfDay[] = ["morning", "afternoon", "evening", "any"];

function formatHourLabel(hour: number): string {
  const hours = Math.floor(hour);
  const mins = Math.round((hour - hours) * 60);
  if (hours === 0 || hours === 24) return mins > 0 ? `12:${mins.toString().padStart(2, "0")} AM` : "12:00 AM";
  if (hours === 12) return mins > 0 ? `12:${mins.toString().padStart(2, "0")} PM` : "12:00 PM";
  const ampm = hours < 12 ? "AM" : "PM";
  const display = hours > 12 ? hours - 12 : hours;
  return mins > 0 ? `${display}:${mins.toString().padStart(2, "0")} ${ampm}` : `${display}:00 ${ampm}`;
}

export default function SettingsPage() {
  const { preferences, updatePreferences, clearAllData } = useDayFlow();
  const [showConfirm, setShowConfirm] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const handleClearData = async () => {
    await clearAllData();
    setShowConfirm(false);
    window.location.reload();
  };

  const updateCategoryWindow = (catId: string, field: "startHour" | "endHour", value: number) => {
    const updatedCategories = preferences.categories.map((c) => {
      if (c.id !== catId) return c;
      const current = c.schedulingWindow || { startHour: 7, endHour: 21 };
      return { ...c, schedulingWindow: { ...current, [field]: value } };
    });
    updatePreferences({ categories: updatedCategories });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-display text-xl text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Customize your planning style</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {/* Planning */}
        <Section title="Planning">
          <HourStepper
            label="Work starts"
            value={preferences.workStartHour}
            onChange={(v) => {
              updatePreferences({ workStartHour: v });
              // Also update work category window start
              const updatedCategories = preferences.categories.map((c) =>
                c.id === "work"
                  ? { ...c, schedulingWindow: { ...(c.schedulingWindow || { startHour: v, endHour: preferences.workEndHour }), startHour: v } }
                  : c
              );
              updatePreferences({ workStartHour: v, categories: updatedCategories });
            }}
            min={4}
            max={12}
          />
          <HourStepper
            label="Work ends"
            value={preferences.workEndHour}
            onChange={(v) => {
              const updatedCategories = preferences.categories.map((c) =>
                c.id === "work"
                  ? { ...c, schedulingWindow: { ...(c.schedulingWindow || { startHour: preferences.workStartHour, endHour: v }), endHour: v } }
                  : c
              );
              updatePreferences({ workEndHour: v, categories: updatedCategories });
            }}
            min={14}
            max={22}
          />
          <HourStepper
            label="Lunch at"
            value={preferences.lunchHour}
            onChange={(v) => updatePreferences({ lunchHour: v })}
            min={11}
            max={14}
          />
          <HourStepper
            label="Dinner at"
            value={preferences.dinnerHour ?? 18.5}
            onChange={(v) => updatePreferences({ dinnerHour: v })}
            min={17}
            max={21}
          />
          <div className="flex items-center justify-between px-3 py-3">
            <span className="text-sm text-foreground">Default task duration</span>
            <div className="flex items-center gap-1.5">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => updatePreferences({ defaultTaskDuration: d })}
                  className={cn(
                    "rounded-lg px-2 py-1 text-xs font-medium transition-all",
                    preferences.defaultTaskDuration === d
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  {d >= 60 ? `${d / 60}h` : `${d}m`}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* Category Scheduling Windows */}
        <Section title="Category Schedule Windows">
          <p className="text-xs text-muted-foreground px-3 py-2">
            Set when each category can be scheduled. Work tasks stay within work hours; other categories have flexible windows.
          </p>
          {preferences.categories.map((cat) => {
            const dotClass = CATEGORY_COLOR_MAP[cat.color] || "bg-muted";
            const isExpanded = expandedCategory === cat.id;
            const window = cat.schedulingWindow || { startHour: 7, endHour: 21 };
            const isWorkCategory = cat.id === "work";

            return (
              <div key={cat.id}>
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                  className="flex items-center gap-3 py-3 px-3 w-full active:bg-muted rounded-xl transition-colors"
                >
                  <div className={`h-3 w-3 rounded-full ${dotClass}`} />
                  <span className="text-sm text-foreground flex-1 text-left">{cat.name}</span>
                  <span className="text-xs text-muted-foreground mr-1">
                    {formatHourLabel(window.startHour)} – {formatHourLabel(window.endHour)}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-2">
                        {isWorkCategory && (
                          <p className="text-[10px] text-muted-foreground">
                            Synced with work hours above
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Earliest</span>
                          <HourStepperInline
                            value={window.startHour}
                            onChange={(v) => updateCategoryWindow(cat.id, "startHour", v)}
                            min={0}
                            max={window.endHour - 1}
                            disabled={isWorkCategory}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Latest</span>
                          <HourStepperInline
                            value={window.endHour}
                            onChange={(v) => updateCategoryWindow(cat.id, "endHour", v)}
                            min={window.startHour + 1}
                            max={24}
                            disabled={isWorkCategory}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Section>

        {/* Wellness */}
        <Section title="Wellness">
          <div className="flex items-center justify-between px-3 py-3">
            <span className="text-sm text-foreground">Preferred workout time</span>
            <div className="flex items-center gap-1">
              {TIME_OF_DAY_OPTIONS.filter(t => t !== "any").map((t) => (
                <button
                  key={t}
                  onClick={() => updatePreferences({ workoutTime: t })}
                  className={cn(
                    "rounded-lg px-2 py-1 text-xs font-medium capitalize transition-all",
                    preferences.workoutTime === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <ToggleRow
            label="Include reset breaks"
            value={preferences.includeBreaks ?? true}
            onChange={(v) => updatePreferences({ includeBreaks: v })}
          />
          <ToggleRow
            label="Protect meal times"
            value={preferences.protectMealTimes ?? true}
            onChange={(v) => updatePreferences({ protectMealTimes: v })}
          />
        </Section>

        {/* Sleep */}
        <Section title="Sleep">
          <p className="text-xs text-muted-foreground px-3 py-2">
            Nothing will be scheduled during sleep hours.
          </p>
          <HourStepper
            label="Sleep starts"
            value={preferences.sleepStartHour ?? 23}
            onChange={(v) => updatePreferences({ sleepStartHour: v })}
            min={20}
            max={24}
          />
          <HourStepper
            label="Wake up"
            value={preferences.sleepEndHour ?? 7}
            onChange={(v) => updatePreferences({ sleepEndHour: v })}
            min={4}
            max={10}
          />
        </Section>

        {/* Account */}
        <Section title="Account">
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center justify-between px-3 py-3 tap-target cursor-pointer active:bg-muted rounded-xl transition-colors w-full text-left"
          >
            <span className="text-sm text-destructive">Clear all data</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </Section>
      </div>

      {/* Confirmation dialog */}
      <AnimatePresence>
        {showConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirm(false)}
              className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl bg-card p-6"
              style={{ boxShadow: "0 8px 32px hsl(220 20% 30% / 0.2)" }}
            >
              <h3 className="text-display text-lg text-foreground mb-2">Clear all data?</h3>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                This will permanently delete all tasks, schedules, chat history, and custom projects. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 rounded-xl bg-secondary py-2.5 text-sm font-medium text-foreground active:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearData}
                  className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-medium text-destructive-foreground active:opacity-90 transition-opacity"
                >
                  Clear everything
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <p className="text-meta text-[10px] uppercase text-muted-foreground mb-2 tracking-widest">{title}</p>
      <div className="surface-card divide-y divide-border">{children}</div>
    </div>
  );
}

function HourStepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-foreground disabled:opacity-30 active:bg-muted transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="text-sm text-foreground font-medium w-20 text-center">
          {formatHourLabel(value)}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-foreground disabled:opacity-30 active:bg-muted transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function HourStepperInline({
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", disabled && "opacity-40 pointer-events-none")}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:bg-muted transition-colors"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="text-xs text-foreground font-medium w-16 text-center">
        {formatHourLabel(value)}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-foreground disabled:opacity-30 active:bg-muted transition-colors"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="flex items-center justify-between px-3 py-3 w-full active:bg-muted rounded-xl transition-colors"
    >
      <span className="text-sm text-foreground">{label}</span>
      <div
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          value ? "bg-primary" : "bg-muted"
        )}
      >
        <div
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            value ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </div>
    </button>
  );
}
