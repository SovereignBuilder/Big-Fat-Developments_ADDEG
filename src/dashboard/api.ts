import { FastifyInstance } from "fastify";
import { AddegConfig } from "../config.js";
import { appendEventText, readInboxEvents, getInboxMetadata } from "../inbox.js";
import { todayYmd, openPath } from "../utils.js";

interface RouteOptions {
  cfg: AddegConfig;
}

export async function dashboardRoutes(fastify: FastifyInstance, options: RouteOptions) {
  const { cfg } = options;
  const collectionKeys = Object.keys(cfg.collections);
  const defaultCollection =
    cfg.dashboard?.defaultCollection ||
    (cfg.collections.devDiary ? "devDiary" : collectionKeys[0]);

  // GET /api/config - Get dashboard config
  fastify.get("/api/config", async () => {
    return {
      title: cfg.dashboard?.title || "ADDEG Dashboard",
      collections: collectionKeys,
      defaultCollection,
      topicsAllowed: cfg.collections[defaultCollection]?.rules?.topics?.allowed || [],
    };
  });

  // GET /api/inbox?date=YYYY-MM-DD
  fastify.get<{ Querystring: { date?: string } }>("/api/inbox", async (request) => {
    const date = request.query.date || todayYmd();
    const events = await readInboxEvents({ cfg, date });
    const meta = await getInboxMetadata({ cfg, date });
    return { date, events, meta };
  });

  // POST /api/inbox - Add new item (Append)
  fastify.post<{ Body: { text: string; date?: string } }>("/api/inbox", async (request) => {
    const { text, date } = request.body;
    if (!text) throw new Error("Text is required");
    
    const targetDate = date || todayYmd();
    await appendEventText({ cfg, date: targetDate, text });
    
    return { success: true };
  });

  // PUT /api/inbox - Rewrite entire inbox for date (Edit Mode)
  fastify.put<{ Body: { events: Array<{section: string, text: string, ts?: string}>; date?: string } }>("/api/inbox", async (request) => {
    const { events, date } = request.body;
    if (!Array.isArray(events)) throw new Error("Events array required");
    
    const targetDate = date || todayYmd();
    
    // We need a way to overwrite the inbox file.
    // Since inbox.ts doesn't export an overwrite function, we'll import fs here.
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname, resolve } = await import("node:path");
    const { toYmd, nowIso } = await import("../utils.js");
    
    const ymd = toYmd(targetDate);
    const filePath = resolve(cfg.repoRoot, cfg.inboxDir, `${ymd}.jsonl`);
    
    await mkdir(dirname(filePath), { recursive: true });
    
    // Reconstruct file content
    const lines = events.map(e => {
        return JSON.stringify({
            ts: e.ts || nowIso(),
            date: ymd,
            section: e.section,
            text: e.text
        });
    });
    
    await writeFile(filePath, lines.join("\n") + "\n", "utf8");
    
    return { success: true };
  });

  // POST /api/compile - Compile entry
  fastify.post<{ Body: { date?: string; title?: string; topics?: string; collection?: string } }>(
    "/api/compile",
    async (request, reply) => {
    const { date, title, topics, collection } = request.body;
    
    const { compileEntry } = await import("../compiler.js");
    
    const targetDate = date || todayYmd();
    // title passed from frontend is now the full title, not just suffix
    // But compileEntry expects a suffix to prepend date.
    // We need to handle this.
    // If the title starts with "Dev-Diary Entry YYYY-MM-DD", let's extract the real suffix or pass it through.
    
    // Actually, simpler: let's update compileEntry to handle "raw titles" or just adjust how we call it.
    // The current compileEntry does: const title = `${date} - ${opts.titleSuffix}`.trim();
    // If we pass a full title as suffix, we get "2026-01-08 - Dev-Diary Entry 2026-01-08 - Suffix". Bad.
    
    // HACK: We will pass a special flag or strip the date from the title if present to satisfy compileEntry's logic
    // OR better: we change the frontend to pass `suffix` and `fullTitle` separately?
    // Let's stick to the current backend logic: it expects a suffix.
    
    // The frontend sends "Dev-Diary Entry 2026-01-08 - Suffix"
    // compileEntry adds "2026-01-08 - " prefix.
    
    // Let's strip the prefix "Dev-Diary Entry YYYY-MM-DD" if present, 
    // AND strip the date prefix that compileEntry might duplicate.
    
    let effectiveSuffix = title || "Daily Log";
    const datePrefix = `Dev-Diary Entry ${targetDate}`;
    
    if (effectiveSuffix.startsWith(datePrefix)) {
       effectiveSuffix = effectiveSuffix.slice(datePrefix.length).trim();
       // Remove leading dash if present
       if (effectiveSuffix.startsWith("- ")) {
         effectiveSuffix = effectiveSuffix.slice(2);
       }
    }
    
    // If empty after stripping, default to "Daily Log" or empty?
    if (!effectiveSuffix) effectiveSuffix = "Daily Log";

    const collectionKey = collection || defaultCollection;

    let result: { outputPath: string };
    try {
      result = await compileEntry({
        cfg,
        date: targetDate,
        collectionKey,
        titleSuffix: effectiveSuffix,
        topicsCsv: topics || "general",
      });
    } catch (err) {
      request.log.error(err);
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({ success: false, message });
    }

    // Auto-open the compiled file
    try {
      await openPath(result.outputPath);
    } catch (err) {
      // Ignore open errors, just return path
      request.log.error(err);
    }

    return { success: true, path: result.outputPath };
  });
}
