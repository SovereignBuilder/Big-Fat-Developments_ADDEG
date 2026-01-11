import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AddegConfig, CollectionConfig, CollectionRules } from "./config.js";
import { readInboxEvents, saveInboxMetadata } from "./inbox.js";
import { slugify, toYmd } from "./utils.js";

type SectionBuckets = {
  context: Array<{ ts?: string; text: string }>;
  actions: Array<{ ts?: string; text: string }>;
  observations: Array<{ ts?: string; text: string }>;
  openThreads: Array<{ ts?: string; text: string }>;
};

function bucketize(
  events: Array<{ section: keyof SectionBuckets; text: string; ts?: string }>
): SectionBuckets {
  const buckets: SectionBuckets = {
    context: [],
    actions: [],
    observations: [],
    openThreads: [],
  };
  for (const e of events) {
    buckets[e.section].push({ ts: e.ts, text: e.text });
  }
  return buckets;
}

function renderTime(ts?: string): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function renderBullets(items: Array<{ ts?: string; text: string }>): string {
  if (!items.length) return "- (none)";
  return items
    .map((item) => {
      const t = renderTime(item.ts);
      const prefix = t ? `${t} ` : "";
      return `- ${prefix}${item.text}`;
    })
    .join("\n");
}

function sectionLabel(section: keyof SectionBuckets): string {
  switch (section) {
    case "context":
      return "Context";
    case "actions":
      return "Action";
    case "observations":
      return "Observation";
    case "openThreads":
      return "Open Thread";
  }
}

function renderTimeline(
  events: Array<{ section: keyof SectionBuckets; text: string; ts?: string }>
): string {
  if (!events.length) return "- (none)";
  const sorted = events
    .map((e, index) => ({ ...e, index }))
    .sort((a, b) => {
      const ta = a.ts ? new Date(a.ts).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.ts ? new Date(b.ts).getTime() : Number.POSITIVE_INFINITY;
      if (Number.isNaN(ta) && Number.isNaN(tb)) return a.index - b.index;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      if (ta !== tb) return ta - tb;
      return a.index - b.index;
    });

  return sorted
    .map((e) => {
      const t = renderTime(e.ts);
      const timePart = t ? `${t} ` : "";
      return `- ${timePart}(${sectionLabel(e.section)}) ${e.text}`;
    })
    .join("\n");
}

function clampExcerpt(text: string, rule?: { min: number; max: number }): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!rule) return cleaned;
  if (cleaned.length >= rule.min && cleaned.length <= rule.max) return cleaned;
  const trimmed = cleaned.slice(0, rule.max).trim();
  if (trimmed.length < rule.min) {
    // best-effort: pad by falling back to original slice; caller can override via config/template later
    return cleaned.slice(0, Math.max(rule.min, Math.min(rule.max, cleaned.length))).trim();
  }
  return trimmed;
}

function validateRules(args: {
  collectionKey: string;
  rules?: CollectionRules;
  title: string;
  excerpt: string;
  topics: string[];
}) {
  const { rules, title, excerpt, topics } = args;
  if (!rules) return;

  if (rules.titleRegex) {
    const re = new RegExp(rules.titleRegex);
    if (!re.test(title)) {
      const help = rules.titleFormatHelp ? ` (${rules.titleFormatHelp})` : "";
      throw new Error(`Invalid title for ${args.collectionKey}${help}: "${title}"`);
    }
  }

  if (rules.excerpt) {
    const len = excerpt.length;
    if (len > rules.excerpt.max) {
      throw new Error(
        `Excerpt must be at most ${rules.excerpt.max} chars for ${args.collectionKey} (got ${len}).`
      );
    }
    // We relax the strict min-length check because sometimes an entry is naturally short.
    // However, we still ensure it's not empty if a min is required.
    if (rules.excerpt.min > 0 && len === 0) {
      throw new Error(`Excerpt is required for ${args.collectionKey}.`);
    }
  }

  if (rules.topics) {
    const minCount = rules.topics.minCount ?? 0;
    if (topics.length < minCount) {
      throw new Error(`At least ${minCount} topic(s) required for ${args.collectionKey}.`);
    }
    const allowed = new Set(rules.topics.allowed);
    const invalid = topics.filter((t) => !allowed.has(t));
    if (invalid.length) {
      throw new Error(
        `Invalid topic(s) for ${args.collectionKey}: ${invalid.join(
          ", "
        )}. Allowed: ${rules.topics.allowed.join(", ")}`
      );
    }
  }
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

function normalizeTopicsCsv(csv: string): string[] {
  return csv
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function compileEntry(opts: {
  cfg: AddegConfig;
  date: string;
  collectionKey: string;
  titleSuffix: string;
  topicsCsv: string;
}): Promise<{ outputPath: string }> {
  const collection = opts.cfg.collections[opts.collectionKey];
  if (!collection) {
    throw new Error(
      `Unknown collection "${opts.collectionKey}". Available: ${Object.keys(opts.cfg.collections).join(", ")}`
    );
  }

  const date = toYmd(opts.date);
  const title = `${date} - ${opts.titleSuffix}`.trim();
  const topics = normalizeTopicsCsv(opts.topicsCsv);

  const events = await readInboxEvents({ cfg: opts.cfg, date });
  const normalizedEvents = events.map((e) => ({
    section: e.section as keyof SectionBuckets,
    text: e.text,
    ts: e.ts,
  }));
  const buckets = bucketize(normalizedEvents);

  const excerptSeed =
    buckets.actions[0]?.text ||
    buckets.observations[0]?.text ||
    buckets.context[0]?.text ||
    `Dev Diary entry for ${date}.`;

  const excerpt = clampExcerpt(excerptSeed, collection.rules?.excerpt);

  validateRules({
    collectionKey: opts.collectionKey,
    rules: collection.rules,
    title,
    excerpt,
    topics,
  });

  const templatePath = resolve(opts.cfg.repoRoot, collection.templatePath);
  if (!existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const template = await readFile(templatePath, "utf8");

  const draft = collection.draftDefault ?? true;
  const vars = {
    title,
    date,
    excerpt: excerpt.replace(/"/g, '\\"'),
    topics: `[${topics.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(", ")}]`,
    draft: String(draft),
    context: renderBullets(buckets.context),
    actions: renderBullets(buckets.actions),
    observations: renderBullets(buckets.observations),
    openThreads: renderBullets(buckets.openThreads),
    timeline: renderTimeline(normalizedEvents),
  };

  const rendered = fillTemplate(template, vars).trimEnd() + "\n";

  const outDir = resolveOutputDir(collection);
  await mkdir(outDir, { recursive: true });

  const slug = slugify(`${date}-${opts.titleSuffix}`) || `${date}-dev-diary`;
  const outPath = resolve(outDir, `${slug}.md`);
  await writeFile(outPath, rendered, "utf8");

  // Persist metadata for future re-compiles
  await saveInboxMetadata({
    cfg: opts.cfg,
    date: date,
    metadata: {
      titleSuffix: opts.titleSuffix,
      topicsCsv: opts.topicsCsv
    }
  });

  return { outputPath: outPath };
}

function resolveOutputDir(collection: CollectionConfig): string {
  // outputDir may be absolute; if relative, resolve from CWD.
  const out = collection.outputDir;
  if (/^[a-zA-Z]:[\\/]/.test(out) || out.startsWith("/")) return out;
  return resolve(process.cwd(), out);
}
