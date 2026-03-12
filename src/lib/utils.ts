import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatHour(h: number): string {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  const ampm = hours < 12 ? "AM" : "PM";
  const display = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return mins > 0 ? `${display}:${mins.toString().padStart(2, "0")} ${ampm}` : `${display} ${ampm}`;
}
