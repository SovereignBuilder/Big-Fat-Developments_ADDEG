import { mkdir, readFile, appendFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import YAML from "yaml";
import type { AddegConfig, CollectionConfig } from "./config.js";
import { nowIso, todayYmd, toYmd } from "./utils.js";

export type InboxSection = "context" | "actions" | "observations" | "openThreads" | "meta";

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

function resolveOutputDir(collection: CollectionConfig): string {
  const out = collection.outputDir;
  if (/^[a-zA-Z]:[\\/]/.test(out) || out.startsWith("/")) return out;
  return resolve(process.cwd(), out);
}

async function scanForOutputFile(dir: string, dateYmd: string): Promise<string | null> {
  try {
    if (!existsSync(dir)) return null;
    const files = await readdir(dir);
    // Find file starting with dateYmd and ending in .md
    // We sort by length descending to match longest valid name if multiple (unlikely)
    const match = files
      .filter(f => f.startsWith(dateYmd) && f.endsWith(".md"))
      .sort((a, b) => b.length - a.length)[0];
    
    if (match) return resolve(dir, match);
  } catch (e) {
    // ignore
  }
  return null;
}

async function getMetadataFromOutput(cfg: AddegConfig, date: string): Promise<Record<string, any>> {
  const ymd = toYmd(date);
  const foundMeta: Record<string, any> = {};

  for (const col of Object.values(cfg.collections)) {
    const outDir = resolveOutputDir(col);
    const filePath = await scanForOutputFile(outDir, ymd);
    
    if (filePath) {
      try {
        const content = await readFile(filePath, "utf8");
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (match) {
          const frontmatter = YAML.parse(match[1]);
          
          if (frontmatter.title) {
            // Reverse engineer the suffix
            // If title is "2026-01-09 - My Title", suffix is "My Title"
            // If title is "My Title", suffix is "My Title"
            const prefix = `${ymd} - `;
            if (String(frontmatter.title).startsWith(prefix)) {
              foundMeta.titleSuffix = String(frontmatter.title).slice(prefix.length).trim();
            } else {
              foundMeta.titleSuffix = String(frontmatter.title);
            }
          }
          
          if (frontmatter.topics) {
            if (Array.isArray(frontmatter.topics)) {
              foundMeta.topicsCsv = frontmatter.topics.join(", ");
            } else {
               foundMeta.topicsCsv = String(frontmatter.topics);
            }
          }
          
          // Break after finding first valid file? 
          // Usually we only have one dev diary per day.
          break;
        }
      } catch (e) {
        // ignore parse error
      }
    }
  }
  
  return foundMeta;
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
      if (parsed && parsed.ts && parsed.section && parsed.text) {
        if (parsed.section === "meta") continue; // Skip metadata events in standard read
        events.push(parsed);
      }
    } catch {
      // ignore malformed lines
    }
  }
  return events;
}

export async function saveInboxMetadata(opts: {
  cfg: AddegConfig;
  date: string;
  metadata: Record<string, any>;
}): Promise<void> {
  const filePath = inboxPath(opts.cfg, opts.date);
  await mkdir(dirname(filePath), { recursive: true });

  // simple append - last write wins strategy for metadata
  const event: InboxEvent = {
    ts: nowIso(),
    date: toYmd(opts.date),
    section: "meta" as InboxSection,
    text: JSON.stringify(opts.metadata),
  };

  await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function getInboxMetadata(opts: {
  cfg: AddegConfig;
  date: string;
}): Promise<Record<string, any> | null> {
  const filePath = inboxPath(opts.cfg, opts.date);
  
  let lastMeta: Record<string, any> | null = null;
  
  // 1. Read from JSONL first (if exists)
  if (existsSync(filePath)) {
    const raw = await readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
        const parsed = JSON.parse(trimmed) as InboxEvent;
        if (parsed.section === "meta" as InboxSection) {
            lastMeta = JSON.parse(parsed.text);
        }
        } catch {
        // ignore
        }
    }
  }

  // 2. Read from Output File (sync) - this overrides JSONL if present
  const outputMeta = await getMetadataFromOutput(opts.cfg, opts.date);
  
  if (outputMeta && Object.keys(outputMeta).length > 0) {
    lastMeta = { ...lastMeta, ...outputMeta };
  }
  
  return lastMeta;
}

export async function formatInbox(opts: {
  cfg: AddegConfig;
  date: string;
}): Promise<string> {
  const events = await readInboxEvents(opts);
  const ymd = toYmd(opts.date);
  if (!events.length) return `No inbox entries for ${ymd}.`;

  function formatLocalTime(ts: string): string {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  const header = `Inbox (${ymd}) - ${events.length} item(s)\n`;
  const body = events
    .map((e) => {
      const time = formatLocalTime(e.ts);
      return `- [${time}] (${e.section}) ${e.text}`;
    })
    .join("\n");
  return `${header}\n${body}`;
}
