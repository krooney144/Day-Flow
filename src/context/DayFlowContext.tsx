import React, { createContext, useContext, ReactNode } from "react";
import { useDayFlowStore } from "@/store/dayflow-store";

type StoreType = ReturnType<typeof useDayFlowStore>;

const DayFlowContext = createContext<StoreType | null>(null);

export function DayFlowProvider({ children }: { children: ReactNode }) {
  const store = useDayFlowStore();
  return (
    <DayFlowContext.Provider value={store}>{children}</DayFlowContext.Provider>
  );
}

export function useDayFlow(): StoreType {
  const ctx = useContext(DayFlowContext);
  if (!ctx) throw new Error("useDayFlow must be used within DayFlowProvider");
  return ctx;
}
