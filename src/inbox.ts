import { mkdir, readFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { AddegConfig } from "./config.js";
import { nowIso, todayYmd, toYmd } from "./utils.js";

export type InboxSection = "context" | "actions" | "observations" | "openThreads";

export type InboxEvent = {
  ts: string;
  date: string;
  section: InboxSection;
  text: string;
};

function parseSectionFromText(text: string): { section: InboxSection; cleaned: string } {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const map: Array<[string, InboxSection]> = [
    ["ctx:", "context"],
    ["context:", "context"],
    ["act:", "actions"],
    ["action:", "actions"],
    ["actions:", "actions"],
    ["obs:", "observations"],
    ["observation:", "observations"],
    ["observations:", "observations"],
    ["open:", "openThreads"],
    ["thread:", "openThreads"],
    ["threads:", "openThreads"],
  ];

  for (const [prefix, section] of map) {
    if (lower.startsWith(prefix)) {
      return { section, cleaned: trimmed.slice(prefix.length).trim() };
    }
  }

  return { section: "actions", cleaned: trimmed };
}

function inboxPath(cfg: AddegConfig, date: string): string {
  const ymd = toYmd(date || todayYmd());
  return resolve(cfg.repoRoot, cfg.inboxDir, `${ymd}.jsonl`);
}

export async function appendEventText(opts: {
  cfg: AddegConfig;
  date: string;
  text: string;
}): Promise<string> {
  const { section, cleaned } = parseSectionFromText(opts.text);
  if (!cleaned) throw new Error("Empty note after prefix removal.");

  const filePath = inboxPath(opts.cfg, opts.date);
  await mkdir(dirname(filePath), { recursive: true });

  const event: InboxEvent = {
    ts: nowIso(),
    date: toYmd(opts.date),
    section,
    text: cleaned,
  };

  await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
  return filePath;
}

export async function appendEventInteractive(opts: {
  cfg: AddegConfig;
  date: string;
}): Promise<string> {
  const rl = readline.createInterface({ input, output });
  const lines: string[] = [];
  try {
    // eslint-disable-next-line no-console
    console.log("Enter your note (finish with a single '.' line):");
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const line = await rl.question("> ");
      if (line.trim() === ".") break;
      lines.push(line);
    }
  } finally {
    rl.close();
  }

  const combined = lines.join("\n").trim();
  if (!combined) throw new Error("No note captured.");
  return appendEventText({ cfg: opts.cfg, date: opts.date, text: combined });
}

export async function readInboxEvents(opts: {
  cfg: AddegConfig;
  date: string;
}): Promise<InboxEvent[]> {
  const filePath = inboxPath(opts.cfg, opts.date);
  if (!existsSync(filePath)) return [];
  const raw = await readFile(filePath, "utf8");
  const events: InboxEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as InboxEvent;
      if (parsed && parsed.ts && parsed.section && parsed.text) events.push(parsed);
    } catch {
      // ignore malformed lines
    }
  }
  return events;
}

export async function formatInbox(opts: {
  cfg: AddegConfig;
  date: string;
}): Promise<string> {
  const events = await readInboxEvents(opts);
  const ymd = toYmd(opts.date);
  if (!events.length) return `No inbox entries for ${ymd}.`;

  const header = `Inbox (${ymd}) — ${events.length} item(s)\n`;
  const body = events
    .map((e) => {
      const time = e.ts.includes("T") ? e.ts.split("T")[1]?.slice(0, 5) : e.ts;
      return `- [${time}] (${e.section}) ${e.text}`;
    })
    .join("\n");
  return `${header}\n${body}`;
}
