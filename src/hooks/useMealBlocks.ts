import { useEffect } from "react";
import { useDayFlow } from "@/context/DayFlowContext";
import { TimeBlock } from "@/types/dayflow";

/**
 * Auto-generates meal blocks (lunch + dinner) for today and tomorrow.
 * Only creates blocks if protectMealTimes is enabled and blocks don't already exist.
 * Meals are only generated for the next ~24 hours, not weeks in advance.
 */
export function useMealBlocks() {
  const { timeBlocks, addTimeBlocks, preferences } = useDayFlow();

  useEffect(() => {
    if (!preferences.protectMealTimes) return;

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const currentHour = now.getHours() + now.getMinutes() / 60;
    const lunchHour = preferences.lunchHour ?? 12;
    const dinnerHour = preferences.dinnerHour ?? 18.5;

    // Dates to generate meals for: today + tomorrow
    const dates = [today, tomorrowStr];
    const newBlocks: TimeBlock[] = [];

    for (const date of dates) {
      const isToday = date === today;
      const existingMeals = timeBlocks.filter(
        (b) => b.date === date && b.type === "meal"
      );

      // Check if lunch already exists
      const hasLunch = existingMeals.some(
        (b) => b.startHour >= lunchHour - 1 && b.startHour <= lunchHour + 1
      );
      // Only add lunch if it's in the future (or it's a future date)
      if (!hasLunch && (!isToday || currentHour < lunchHour + 0.5)) {
        newBlocks.push({
          id: `b-meal-lunch-${date}`,
          title: "Lunch",
          categoryId: "",
          date,
          startHour: lunchHour,
          durationHours: 0.5,
          isFixed: false,
          type: "meal",
        });
      }

      // Check if dinner already exists
      const hasDinner = existingMeals.some(
        (b) => b.startHour >= dinnerHour - 1 && b.startHour <= dinnerHour + 1
      );
      if (!hasDinner && (!isToday || currentHour < dinnerHour + 0.5)) {
        newBlocks.push({
          id: `b-meal-dinner-${date}`,
          title: "Dinner",
          categoryId: "",
          date,
          startHour: dinnerHour,
          durationHours: 0.5,
          isFixed: false,
          type: "meal",
        });
      }
    }

    if (newBlocks.length > 0) {
      addTimeBlocks(newBlocks);
    }
  }, [preferences.protectMealTimes, preferences.lunchHour, preferences.dinnerHour]);
}
