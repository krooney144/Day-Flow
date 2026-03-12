import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { ChevronRight } from "lucide-react";

export default function SettingsPage() {
  const { preferences, updatePreferences, clearAllData } = useDayFlow();
  const [workStart, setWorkStart] = useState(preferences.workStartHour);
  const [workEnd, setWorkEnd] = useState(preferences.workEndHour);
  const [lunch, setLunch] = useState(preferences.lunchHour);
  const [showConfirm, setShowConfirm] = useState(false);

  const save = () => {
    updatePreferences({ workStartHour: workStart, workEndHour: workEnd, lunchHour: lunch });
  };

  const handleClearData = async () => {
    await clearAllData();
    setShowConfirm(false);
    window.location.reload();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-display text-xl text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Customize your planning style</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24">
        <Section title="Planning">
          <SettingRow label="Work starts" value={`${workStart}:00 AM`} />
          <SettingRow label="Work ends" value={`${workEnd > 12 ? workEnd - 12 : workEnd}:00 PM`} />
          <SettingRow label="Lunch at" value={`${lunch > 12 ? lunch - 12 : lunch}:00 PM`} />
          <SettingRow label="Default task duration" value={`${preferences.defaultTaskDuration} min`} />
        </Section>

        <Section title="Categories">
          {preferences.categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 py-3">
              <div className={`h-3 w-3 rounded-full bg-cat-${cat.color}`} />
              <span className="text-sm text-foreground flex-1">{cat.name}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </Section>

        <Section title="Wellness">
          <SettingRow label="Preferred workout time" value={preferences.workoutTime} />
          <SettingRow label="Include reset breaks" value="Yes" />
          <SettingRow label="Protect meal times" value="Yes" />
        </Section>

        <Section title="Account">
          <SettingRow label="Change passcode" value="" />
          <SettingRow label="Export data" value="" />
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

function SettingRow({
  label,
  value,
  destructive,
}: {
  label: string;
  value: string;
  destructive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-3 tap-target cursor-pointer active:bg-muted rounded-xl transition-colors">
      <span className={`text-sm ${destructive ? "text-destructive" : "text-foreground"}`}>
        {label}
      </span>
      <div className="flex items-center gap-1">
        {value && <span className="text-sm text-muted-foreground">{value}</span>}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}
