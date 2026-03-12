import { useState } from "react";
import { DayFlowProvider, useDayFlow } from "@/context/DayFlowContext";
import PasscodeScreen from "@/pages/PasscodeScreen";
import SchedulePage from "@/pages/SchedulePage";
import TasksPage from "@/pages/TasksPage";
import ChatPage from "@/pages/ChatPage";
import SettingsPage from "@/pages/SettingsPage";
import BottomNav from "@/components/dayflow/BottomNav";
import RolloverModal from "@/components/dayflow/RolloverModal";

function DayFlowApp() {
  const { isAuthenticated } = useDayFlow();
  const [activeTab, setActiveTab] = useState("schedule");

  if (!isAuthenticated) return <PasscodeScreen />;

  return (
    <div className="min-h-svh bg-background max-w-md mx-auto relative">
      <RolloverModal />
      <div className="h-svh overflow-hidden">
        {activeTab === "schedule" && <SchedulePage />}
        {activeTab === "tasks" && <TasksPage />}
        {activeTab === "chat" && <ChatPage />}
        {activeTab === "settings" && <SettingsPage />}
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

export default function Index() {
  return (
    <DayFlowProvider>
      <DayFlowApp />
    </DayFlowProvider>
  );
}
