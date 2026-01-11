import open from "open";

export function nowIso(): string {
  // Store canonical UTC timestamps. Consumers (dashboard/compiler) should render in local time.
  return new Date().toISOString();
}

export function todayYmd(): string {
  // Return local date YYYY-MM-DD
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(d.getTime() - offsetMs);
  return toYmd(localDate);
}

export function toYmd(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${String(value)}`);
  return d.toISOString().slice(0, 10);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function openPath(path: string): Promise<void> {
  // @ts-ignore - process.versions might not have electron in pure node types, though usually it's fine.
  if (process.versions && (process.versions as any).electron) {
    try {
      // Dynamic import to avoid load-time error in CLI
      const { shell } = await import("electron");
      await shell.openPath(path);
      return;
    } catch (err) {
      // Fallback if electron import fails for some reason
      // eslint-disable-next-line no-console
      console.error("Failed to use electron.shell.openPath:", err);
    }
  }

  await open(path);
}
