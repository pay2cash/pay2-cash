export interface McpEntry {
  id: string;
  name: string;
  description: string;
  defaultBaseUrl: string;
  endpoints: { path: string; description: string }[];
  tags: string[];
}

export const SUPPORTED_MCPS: McpEntry[] = [
  {
    id: "jaalyantra-store",
    name: "jaalyantra Store",
    description: "Fetch products, browse inventory, and query store catalog via jaalyantra.",
    defaultBaseUrl: "https://v3.jaalyantra.com",
    endpoints: [
      { path: "/store/mcp", description: "Store/product MCP — list products, inventory, pricing" },
      { path: "/mcp", description: "General jaalyantra MCP" },
    ],
    tags: ["e-commerce", "store", "products"],
  },
];
