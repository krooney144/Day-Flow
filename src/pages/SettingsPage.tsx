import { useState } from "react";
import { motion } from "framer-motion";
import { useDayFlow } from "@/context/DayFlowContext";
import { ChevronRight } from "lucide-react";

export default function SettingsPage() {
  const { preferences, updatePreferences } = useDayFlow();
  const [workStart, setWorkStart] = useState(preferences.workStartHour);
  const [workEnd, setWorkEnd] = useState(preferences.workEndHour);
  const [lunch, setLunch] = useState(preferences.lunchHour);

  const save = () => {
    updatePreferences({ workStartHour: workStart, workEndHour: workEnd, lunchHour: lunch });
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
          <SettingRow label="Clear all data" value="" destructive />
        </Section>
      </div>
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
