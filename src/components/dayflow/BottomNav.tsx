import { Calendar, CheckSquare, MessageCircle, Settings } from "lucide-react";

interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function BottomNav({ activeTab, onTabChange }: Props) {
  const tabs = [
    { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
    { id: "chat", label: "Planner", icon: MessageCircle },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom,10px)]">
      <div className="mx-3 mb-2 rounded-2xl border border-border bg-card shadow-lg flex h-14 items-center justify-around px-2">
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="tap-target flex flex-col items-center justify-center gap-0.5 px-4 py-1"
            >
              <Icon
                className={`h-5 w-5 transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
                fill={active ? "currentColor" : "none"}
                strokeWidth={active ? 1.5 : 2}
              />
              <span
                className={`text-[10px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
