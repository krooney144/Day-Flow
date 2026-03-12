const SYNC_URL = "/api/sync";

function getUserKey(): string {
  return "1121";
}

export async function loadFromCloud<T>(): Promise<T | null> {
  try {
    const resp = await fetch(SYNC_URL, {
      headers: { "x-user-key": getUserKey() },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export async function saveToCloud<T>(state: T): Promise<boolean> {
  try {
    const resp = await fetch(SYNC_URL, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-user-key": getUserKey(),
      },
      body: JSON.stringify(state),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function clearCloud(): Promise<boolean> {
  try {
    const resp = await fetch(SYNC_URL, {
      method: "DELETE",
      headers: { "x-user-key": getUserKey() },
    });
    return resp.ok;
  } catch {
    return false;
  }
}
