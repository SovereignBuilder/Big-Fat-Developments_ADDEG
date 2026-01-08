import { spawn } from "node:child_process";

export function nowIso(): string {
  // Return local ISO string instead of UTC
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(d.getTime() - offsetMs);
  return localDate.toISOString();
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
  // Windows-friendly; falls back gracefully on other platforms.
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("cmd", ["/c", "start", "", path], {
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", reject);
      child.on("exit", () => resolve());
    });
    return;
  }

  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(opener, [path], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", () => resolve());
  });
}

