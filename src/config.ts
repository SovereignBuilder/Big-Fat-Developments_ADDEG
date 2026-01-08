import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import YAML from "yaml";

export type ExcerptRule = { min: number; max: number };
export type TopicsRule = { allowed: string[]; minCount?: number };
export type CollectionRules = {
  titleRegex?: string;
  titleFormatHelp?: string;
  excerpt?: ExcerptRule;
  topics?: TopicsRule;
};

export type CollectionConfig = {
  outputDir: string;
  templatePath: string;
  draftDefault?: boolean;
  rules?: CollectionRules;
};

export interface DashboardConfig {
  enabled: boolean;
  port: number;
  host: string;
  autoOpen: boolean;
  title: string;
}

export type AddegConfig = {
  projectName?: string;
  repoRoot: string;
  inboxDir: string;
  dashboard?: DashboardConfig;
  collections: Record<string, CollectionConfig>;
};

const DEFAULT_CONFIG_NAME = "addeg.config.json";

export async function loadConfig(explicitPath?: string): Promise<AddegConfig> {
  const configPath = resolveConfigPath(explicitPath);
  const raw = await readFile(configPath, "utf8");
  const data = configPath.toLowerCase().endsWith(".yaml") ||
    configPath.toLowerCase().endsWith(".yml")
    ? YAML.parse(raw)
    : JSON.parse(raw);

  if (!data || typeof data !== "object") throw new Error("Invalid config.");
  const cfg = data as AddegConfig;
  if (!cfg.repoRoot) cfg.repoRoot = ".";
  if (!cfg.inboxDir) cfg.inboxDir = "./inbox";
  if (!cfg.collections || typeof cfg.collections !== "object") {
    throw new Error("Config must include collections.");
  }
  cfg.repoRoot = resolve(cfg.repoRoot);
  return cfg;
}

export function resolveConfigPath(explicitPath?: string): string {
  if (explicitPath) {
    const abs = resolve(explicitPath);
    if (!existsSync(abs)) throw new Error(`Config not found: ${abs}`);
    return abs;
  }

  const abs = resolve(process.cwd(), DEFAULT_CONFIG_NAME);
  if (!existsSync(abs)) {
    throw new Error(
      `Config not found. Run 'addeg init' or create ${DEFAULT_CONFIG_NAME} in: ${process.cwd()}`
    );
  }
  return abs;
}

export async function writePresetFiles(opts: { preset: string; force: boolean }) {
  const presetName = opts.preset;
  const presetDir = resolve(process.cwd(), "presets", presetName);
  const presetConfigPath = resolve(presetDir, "addeg.config.json");
  if (!existsSync(presetConfigPath)) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  const targetConfigPath = resolve(process.cwd(), DEFAULT_CONFIG_NAME);
  if (existsSync(targetConfigPath) && !opts.force) {
    throw new Error(`Config already exists: ${targetConfigPath} (use --force)`);
  }

  const rawConfig = await readFile(presetConfigPath, "utf8");
  await writeFile(targetConfigPath, rawConfig, "utf8");

  // Ensure inbox dir exists
  const cfg = JSON.parse(rawConfig) as AddegConfig;
  const inboxPath = resolve(process.cwd(), cfg.inboxDir || "inbox");
  await mkdir(inboxPath, { recursive: true });

  // Ensure templates exist (default template folder is committed; just ensure path for relative config)
  const templatePath = resolve(process.cwd(), cfg.collections.devDiary?.templatePath || "");
  if (templatePath && !existsSync(templatePath)) {
    await mkdir(dirname(templatePath), { recursive: true });
    const defaultTemplate = resolve(process.cwd(), "templates", "default", "dev-diary.md");
    if (existsSync(defaultTemplate)) {
      const content = await readFile(defaultTemplate, "utf8");
      await writeFile(templatePath, content, "utf8");
    }
  }
}

