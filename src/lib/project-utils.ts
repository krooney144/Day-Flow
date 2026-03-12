import { DEFAULT_PROJECTS } from "@/types/dayflow";

/** Merge default projects with user-created custom projects */
export function mergeProjects(customProjects: Record<string, string[]>): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  const allKeys = new Set([...Object.keys(DEFAULT_PROJECTS), ...Object.keys(customProjects)]);
  for (const key of allKeys) {
    const defaults = DEFAULT_PROJECTS[key] || [];
    const custom = customProjects[key] || [];
    const combined = [...defaults];
    for (const p of custom) {
      if (!combined.includes(p)) combined.push(p);
    }
    merged[key] = combined;
  }
  return merged;
}
