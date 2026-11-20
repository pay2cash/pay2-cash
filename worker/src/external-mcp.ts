// Minimal MCP client for calling external MCP servers (JSON-RPC 2.0 over HTTP).
// The v3.jaalyantra.com MCP requires:
//   - Accept: application/json, text/event-stream
//   - Optionally: x-publishable-api-key (storefront publishable key)

const REQUEST_TIMEOUT_MS = 15_000;

export class ExternalMcpClient {
  constructor(
    private readonly endpoint: string,
    private readonly publishableKey?: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (this.publishableKey) h["x-publishable-api-key"] = this.publishableKey;
    return h;
  }

  /**
   * POST a JSON-RPC request and return the parsed `result` object.
   * Handles plain-JSON and SSE-encoded responses, and throws readable errors
   * for network failures, non-2xx statuses, and JSON-RPC errors.
   */
  private async rpc(payload: Record<string, unknown>): Promise<any> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "unknown error";
      throw new Error(`external MCP ${this.endpoint}: request failed (${reason})`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `external MCP ${this.endpoint}: HTTP ${res.status} ${text.slice(0, 200)}`.trim(),
      );
    }

    const data = await this.parseBody(res);
    if (data.error) {
      throw new Error(`external MCP ${this.endpoint}: ${data.error.message ?? "JSON-RPC error"}`);
    }
    if (data.result === undefined) {
      throw new Error(`external MCP ${this.endpoint}: response missing result`);
    }
    return data.result;
  }

  /** Read the response body as text, then parse it as JSON or SSE-framed JSON. */
  private async parseBody(res: Response): Promise<any> {
    let text: string;
    try {
      text = await res.text();
    } catch (e) {
      const reason = e instanceof Error ? e.message : "unknown error";
      throw new Error(`external MCP ${this.endpoint}: failed reading body (${reason})`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    const raw = contentType.includes("text/event-stream")
      ? // SSE framing: parse the last `data:` line.
        text
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .pop()
          ?.slice("data:".length)
          .trim()
      : text;

    if (!raw) throw new Error(`external MCP ${this.endpoint}: empty response body`);

    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(
        `external MCP ${this.endpoint}: non-JSON response: ${raw.slice(0, 200)}`,
      );
    }
  }

  async listTools(): Promise<Array<{ name: string; description: string }>> {
    const result = await this.rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    return result.tools ?? [];
  }

  async callTool<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const result = await this.rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    });
    if (result.isError) {
      const text = result.content?.[0]?.text ?? "unknown error";
      throw new Error(`external MCP ${this.endpoint} ${name}: ${text}`);
    }
    const text = result.content?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error(`external MCP ${this.endpoint} ${name}: response has no text content`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      // Tool returned plain text rather than JSON — return it as-is.
      return text as unknown as T;
    }
  }
}
