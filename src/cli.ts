#!/usr/bin/env node
import { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { openPath, todayYmd } from "./utils.js";
import { loadConfig, writePresetFiles } from "./config.js";
import { appendEventInteractive, appendEventText, formatInbox } from "./inbox.js";
import { compileEntry } from "./compiler.js";

const program = new Command();

program
  .name("addeg")
  .description("Automatic Dev-Diary Entry Generator (config-driven, local-first).")
  .option("-c, --config <path>", "Path to addeg.config.json");

program
  .command("init")
  .description("Create config + templates (optionally using a preset).")
  .option("--preset <name>", "Preset name (e.g. bfd)")
  .option("--force", "Overwrite existing files", false)
  .action(async (options) => {
    const preset = String(options.preset ?? "").trim() || "default";
    await writePresetFiles({ preset, force: Boolean(options.force) });
    // eslint-disable-next-line no-console
    console.log(`Initialized ADDEG preset: ${preset}`);
    // eslint-disable-next-line no-console
    console.log(`Next: edit ./addeg.config.json if needed, then run: addeg doctor`);
  });

program
  .command("doctor")
  .description("Validate config + show resolved paths.")
  .action(async () => {
    const cfg = await loadConfig(program.opts().config);
    const resolvedInbox = resolve(cfg.repoRoot, cfg.inboxDir);
    // eslint-disable-next-line no-console
    console.log("Config OK");
    // eslint-disable-next-line no-console
    console.log(`repoRoot: ${cfg.repoRoot}`);
    // eslint-disable-next-line no-console
    console.log(`inboxDir: ${resolvedInbox}`);
    for (const [name, collection] of Object.entries(cfg.collections)) {
      // eslint-disable-next-line no-console
      console.log(`collection.${name}.outputDir: ${collection.outputDir}`);
      // eslint-disable-next-line no-console
      console.log(
        `collection.${name}.templatePath: ${resolve(cfg.repoRoot, collection.templatePath)}`
      );
    }
  });

program
  .command("add")
  .description("Append a single note line to today's inbox JSONL.")
  .argument("<text...>", "Text to append (supports ctx:/act:/obs:/open: prefixes)")
  .option("--date <YYYY-MM-DD>", "Target date (default: today)")
  .action(async (textParts, options) => {
    const cfg = await loadConfig(program.opts().config);
    const date = String(options.date ?? "").trim() || todayYmd();
    const text = Array.isArray(textParts) ? textParts.join(" ").trim() : String(textParts);
    if (!text) throw new Error("No text provided.");
    const outPath = await appendEventText({ cfg, date, text });
    // eslint-disable-next-line no-console
    console.log(`Added to inbox: ${outPath}`);
  });

program
  .command("note")
  .description("Capture a multi-line note (finish with a single '.' line).")
  .option("--date <YYYY-MM-DD>", "Target date (default: today)")
  .action(async (options) => {
    const cfg = await loadConfig(program.opts().config);
    const date = String(options.date ?? "").trim() || todayYmd();
    const outPath = await appendEventInteractive({ cfg, date });
    // eslint-disable-next-line no-console
    console.log(`Added to inbox: ${outPath}`);
  });

program
  .command("inbox")
  .description("Print a human-readable view of the inbox for a date.")
  .option("--date <YYYY-MM-DD>", "Target date (default: today)")
  .action(async (options) => {
    const cfg = await loadConfig(program.opts().config);
    const date = String(options.date ?? "").trim() || todayYmd();
    const text = await formatInbox({ cfg, date });
    // eslint-disable-next-line no-console
    console.log(text);
  });

program
  .command("compile")
  .description("Compile inbox JSONL into a Markdown entry using the configured template.")
  .requiredOption("--collection <name>", "Collection key from config (e.g. devDiary)")
  .requiredOption(
    "--title <suffix>",
    "Title suffix (compiler will prepend YYYY-MM-DD - )"
  )
  .requiredOption("--topics <csv>", "Topics CSV (validated if rules define allowed list)")
  .option("--date <YYYY-MM-DD>", "Target date (default: today)")
  .option("--open", "Open the compiled file after writing", false)
  .action(async (options) => {
    const cfg = await loadConfig(program.opts().config);
    const date = String(options.date ?? "").trim() || todayYmd();
    const collectionKey = String(options.collection).trim();
    const titleSuffix = String(options.title).trim();
    const topicsCsv = String(options.topics).trim();
    const result = await compileEntry({
      cfg,
      date,
      collectionKey,
      titleSuffix,
      topicsCsv,
    });
    // eslint-disable-next-line no-console
    console.log(`Wrote: ${result.outputPath}`);
    if (options.open) {
      await openPath(result.outputPath);
    }
  });

program
  .command("dashboard")
  .description("Launch the local web dashboard.")
  .action(async () => {
    // Dynamically import to keep initial startup fast
    const { startDashboard } = await import("./dashboard/index.js");
    await startDashboard(program.opts().config);
  });

program.parseAsync(process.argv).catch((error) => {
  // eslint-disable-next-line no-console
  console.error(String(error?.message || error));
  process.exitCode = 1;
});

