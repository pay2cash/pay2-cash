import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { SUPPORTED_MCPS, type McpEntry } from "./supported-mcps.js";

interface McpEntryConfig {
  baseUrl: string;
  publishableKey?: string;
}

interface McpConfig {
  enabled: Record<string, McpEntryConfig>;
}

function configPath(): string {
  const dir = process.env.PAY2CASH_CONFIG_DIR || join(homedir(), ".config", "pay2cash");
  return join(dir, "mcps.json");
}

function load(): McpConfig {
  const path = configPath();
  if (!existsSync(path)) return { enabled: {} };
  try {
    const cfg = JSON.parse(readFileSync(path, "utf-8"));
    if (!cfg || typeof cfg !== "object" || typeof cfg.enabled !== "object" || cfg.enabled === null) {
      console.error(`warning: ${path} is malformed, ignoring it`);
      return { enabled: {} };
    }
    return cfg;
  } catch {
    console.error(`warning: ${path} is not valid JSON, ignoring it`);
    return { enabled: {} };
  }
}

function save(cfg: McpConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n");
  console.log(`saved to ${path}`);
}

function findSupported(id: string): McpEntry | undefined {
  return SUPPORTED_MCPS.find((m) => m.id === id);
}

export async function run(args: string[]): Promise<void> {
  const cmd = args[0];

  if (cmd === "supported") {
    if (SUPPORTED_MCPS.length === 0) {
      console.log("no supported MCPs registered");
      return;
    }
    for (const m of SUPPORTED_MCPS) {
      console.log(`\n  ${m.id}  — ${m.name}`);
      console.log(`    ${m.description}`);
      for (const ep of m.endpoints) {
        console.log(`    endpoint: ${ep.path}  (${ep.description})`);
      }
      console.log(`    tags: ${m.tags.join(", ")}`);
    }
    console.log();
    return;
  }

  if (cmd === "list") {
    const cfg = load();
    const keys = Object.keys(cfg.enabled);
    if (keys.length === 0) {
      console.log("no MCPs configured. run `pay2cash mcp supported` to see available options.");
      return;
    }
    for (const [id, entry] of Object.entries(cfg.enabled)) {
      const meta = findSupported(id);
      console.log(`  ${id}  — ${meta?.name ?? "custom"}  (${entry.baseUrl})`);
    }
    console.log();
    return;
  }

  if (cmd === "add") {
    const id = args[1];
    if (!id) {
      console.error("usage: pay2cash mcp add <id>");
      process.exit(1);
    }
    const meta = findSupported(id);
    if (!meta) {
      console.error(`unsupported MCP: ${id}. run \`pay2cash mcp supported\` to see available options.`);
      process.exit(1);
    }
    const baseUrl = args[2] || meta.defaultBaseUrl;
    const cfg = load();
    cfg.enabled[id] = { baseUrl, publishableKey: cfg.enabled[id]?.publishableKey };
    save(cfg);
    console.log(`enabled MCP: ${id}  →  ${meta.name}`);
    console.log(`  baseUrl: ${baseUrl}`);
    console.log(`  endpoints:`);
    for (const ep of meta.endpoints) {
      console.log(`    ${baseUrl}${ep.path}`);
    }
    return;
  }

  if (cmd === "remove") {
    const id = args[1];
    if (!id) {
      console.error("usage: pay2cash mcp remove <id>");
      process.exit(1);
    }
    const cfg = load();
    if (!cfg.enabled[id]) {
      console.error(`MCP not configured: ${id}`);
      process.exit(1);
    }
    delete cfg.enabled[id];
    save(cfg);
    console.log(`removed MCP: ${id}`);
    return;
  }

  if (cmd === "key") {
    const id = args[1];
    const key = args[2];
    if (!id || !key) {
      console.error("usage: pay2cash mcp key <id> <publishable_key>");
      process.exit(1);
    }
    const cfg = load();
    if (!cfg.enabled[id]) {
      console.error(`MCP not configured: ${id}. run \`pay2cash mcp add ${id}\` first.`);
      process.exit(1);
    }
    cfg.enabled[id].publishableKey = key;
    save(cfg);
    console.log(`set publishable key for MCP: ${id}`);
    return;
  }

  if (cmd === "env") {
    const cfg = load();
    const ids = Object.keys(cfg.enabled);
    if (ids.length === 0) process.exit(0);
    const first = cfg.enabled[ids[0]];
    if (first?.baseUrl) console.log(`V3_JAALYANTRA_BASE_URL=${first.baseUrl}`);
    if (first?.publishableKey) console.log(`V3_STORE_PUBLISHABLE_KEY=${first.publishableKey}`);
    return;
  }

  console.error(`unknown mcp subcommand: ${cmd}`);
  console.error("try: supported, list, add, remove, key, env");
  process.exit(1);
}
