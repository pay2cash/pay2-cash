#!/usr/bin/env node
import { run } from "./mcp.js";

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help") {
  console.log(`
pay2cash — configure pay2 Cash MCP integrations

Usage:
  pay2cash mcp supported       List all supported e-commerce MCP services
  pay2cash mcp list            Show configured MCPs
  pay2cash mcp add <id>        Enable a supported MCP by id
  pay2cash mcp remove <id>     Disable a configured MCP
  pay2cash mcp key <id> <key>  Set the publishable API key for an MCP
  pay2cash mcp env             Print environment variables for configured MCPs
`);
  process.exit(0);
}

if (args[0] === "mcp") {
  await run(args.slice(1));
} else {
  console.error(`unknown command: ${args[0]}`);
  process.exit(1);
}
