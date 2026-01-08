import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import open from "open";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { dashboardRoutes } from "./api.js";

// Fix for __dirname in ESM
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export async function startDashboard(configPath?: string, opts: { skipOpen?: boolean } = {}) {
  const cfg = await loadConfig(configPath);
  const dashboardCfg = cfg.dashboard || {
    enabled: true,
    port: 7825,
    host: "localhost",
    autoOpen: true,
    title: "ADDEG Dashboard",
  };

  const fastify = Fastify({ logger: true });

  // Serve static files (HTML, CSS, JS)
  fastify.register(fastifyStatic, {
    root: join(__dirname, "client"),
    prefix: "/",
  });

  // Redirect root to index.html explicitly
  fastify.get("/", async (req, reply) => {
    return reply.sendFile("index.html");
  });

  // Register API routes
  fastify.register(dashboardRoutes, { cfg });

  try {
    const address = await fastify.listen({ 
      port: dashboardCfg.port, 
      host: dashboardCfg.host 
    });
    // eslint-disable-next-line no-console
    console.log(`Dashboard running at ${address}`);
    
    if (dashboardCfg.autoOpen && !opts.skipOpen) {
      await open(address);
    }
    
    return address;
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}
