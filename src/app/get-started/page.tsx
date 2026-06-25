"use client";

import { useState } from "react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Sparkles,
  Code,
  Boxes,
  FileText,
  Check,
  Copy,
  Download,
} from "lucide-react";

type AppId = "claude" | "chatgpt" | "cursor" | "oss" | "skill";

const APPS: {
  id: AppId;
  label: string;
  sublabel?: string;
  icon: typeof Bot;
}[] = [
  {
    id: "claude",
    label: "Claude (Anthropic)",
    sublabel: "Claude Desktop, Claude Code, claude.ai",
    icon: Bot,
  },
  {
    id: "chatgpt",
    label: "ChatGPT (OpenAI)",
    icon: Sparkles,
  },
  {
    id: "cursor",
    label: "Cursor",
    icon: Code,
  },
  {
    id: "oss",
    label: "Open-source models",
    sublabel: "Llama, Mistral, local models via any MCP client",
    icon: Boxes,
  },
  {
    id: "skill",
    label: "skill.md",
    sublabel: "Drop a skill file into your agent project",
    icon: FileText,
  },
];

const MCP_URL = "https://mcp.pay2.cash";

const SKILL_SNIPPET = `---
name: pay2-cash
description: Pay payments via UPI or card with pay2 Cash.
mcp: mcp.pay2.cash
---

# pay2-cash

Use the pay2 Cash MCP server at mcp.pay2.cash to
send payments over UPI (INR) or card (EUR).`;

const CLAUDE_JSON = `{
  "mcpServers": {
    "pay2cash": { "url": "https://mcp.pay2.cash" }
  }
}`;

const CURSOR_JSON = `{
  "mcpServers": {
    "pay2cash": { "url": "https://mcp.pay2.cash" }
  }
}`;

const OSS_SHELL = `# Point any MCP client at the pay2 Cash server
mcp-client connect --url https://mcp.pay2.cash \\
  --name pay2cash`;

function WindowDots() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-3 rounded-full bg-white/[10%]" />
      <span className="size-3 rounded-full bg-white/[10%]" />
      <span className="size-3 rounded-full bg-white/[10%]" />
    </div>
  );
}

function TerminalCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/[8%] bg-black/40 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[6%] bg-white/[2%]">
        <WindowDots />
        <span className="font-mono text-xs text-white/40">{title}</span>
      </div>
      <div className="p-4 font-mono text-sm text-white/70">{children}</div>
    </div>
  );
}

export default function Page() {
  const [selected, setSelected] = useState<AppId | null>(null);
  const [copied, setCopied] = useState(false);

  const isSkill = selected === "skill";
  const active = selected !== null;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <>
      <SiteNav current="/get-started" />
      <main className="pt-16">
        <section className="relative pt-28 pb-20 px-4">
          <div className="max-w-6xl mx-auto">
            <Badge
              variant="outline"
              className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
            >
              Get Started
            </Badge>
            <h1 className="text-[clamp(2.2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
              Download pay2 Cash
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-white/40 leading-relaxed">
              Connect your AI agent to pay2 Cash in three steps.
            </p>

            <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* COLUMN 1 — Choose your app */}
              <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6">
                <h2 className="text-sm font-medium text-white/50 mb-5">
                  1 · Choose your app
                </h2>
                <div className="flex flex-col gap-2.5">
                  {APPS.map((app) => {
                    const Icon = app.icon;
                    const isSel = selected === app.id;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => setSelected(app.id)}
                        className={`flex items-start gap-3 text-left rounded-xl border p-3.5 transition-all ${
                          isSel
                            ? "border-white/[20%] bg-white/[6%]"
                            : "border-white/[6%] bg-white/[2%] hover:bg-white/[4%] hover:border-white/[10%]"
                        }`}
                      >
                        <div
                          className={`shrink-0 mt-0.5 flex size-8 items-center justify-center rounded-lg border ${
                            isSel
                              ? "border-white/[16%] bg-white/[8%]"
                              : "border-white/[6%] bg-white/[3%]"
                          }`}
                        >
                          <Icon
                            className={`size-4 ${
                              isSel ? "text-white" : "text-white/50"
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div
                            className={`text-sm font-medium ${
                              isSel ? "text-white" : "text-white/80"
                            }`}
                          >
                            {app.label}
                          </div>
                          {app.sublabel && (
                            <div className="mt-0.5 text-xs text-white/40 leading-snug">
                              {app.sublabel}
                            </div>
                          )}
                        </div>
                        {isSel && (
                          <Check className="size-4 text-emerald-400 shrink-0 ml-auto mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* COLUMN 2 — Connect */}
              <div
                className={`rounded-2xl border border-white/[6%] bg-white/[2%] p-6 transition-opacity ${
                  active ? "opacity-100" : "opacity-40 pointer-events-none"
                }`}
              >
                <h2 className="text-sm font-medium text-white/50 mb-5">
                  2 · Connect
                </h2>

                {!active && (
                  <p className="text-sm text-white/40 leading-relaxed">
                    Choose an app to see how to connect.
                  </p>
                )}

                {active && !isSkill && (
                  <div>
                    <h3 className="text-base font-medium text-white mb-3">
                      Add the pay2 Cash MCP server
                    </h3>
                    <div className="rounded-xl border border-white/[8%] bg-white/[3%] p-4 font-mono text-sm text-white/70 flex items-center justify-between gap-3">
                      <span className="text-white text-base tracking-tight">
                        mcp.pay2.cash
                      </span>
                      <Button
                        variant="outline"
                        onClick={copyUrl}
                        className="h-8 px-3 rounded-full border-white/[10%] text-white/70 bg-transparent hover:bg-white/[6%] hover:text-white gap-1.5 text-xs"
                      >
                        {copied ? (
                          <>
                            <Check className="size-3.5 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="mt-4 text-sm text-white/40 leading-relaxed">
                      One endpoint. All payment methods (UPI + card).
                    </p>
                  </div>
                )}

                {active && isSkill && (
                  <div>
                    <h3 className="text-base font-medium text-white mb-3">
                      Add skill.md
                    </h3>
                    <pre className="rounded-xl border border-white/[8%] bg-white/[3%] p-4 font-mono text-sm text-white/70 overflow-x-auto whitespace-pre">
                      {SKILL_SNIPPET}
                    </pre>
                    <Button className="mt-4 h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 font-medium gap-2">
                      <Download className="size-4" />
                      Download skill.md
                    </Button>
                  </div>
                )}
              </div>

              {/* COLUMN 3 — Install */}
              <div
                className={`rounded-2xl border border-white/[6%] bg-white/[2%] p-6 transition-opacity ${
                  active ? "opacity-100" : "opacity-40 pointer-events-none"
                }`}
              >
                <h2 className="text-sm font-medium text-white/50 mb-5">
                  3 · Install
                </h2>

                {!active && (
                  <p className="text-sm text-white/40 leading-relaxed">
                    Choose an app to see install instructions.
                  </p>
                )}

                {active && selected === "claude" && (
                  <TerminalCard title="claude_desktop_config.json">
                    <pre className="whitespace-pre overflow-x-auto">
                      {CLAUDE_JSON}
                    </pre>
                  </TerminalCard>
                )}

                {active && selected === "chatgpt" && (
                  <TerminalCard title="ChatGPT — Connectors">
                    <ol className="space-y-2.5 text-white/70">
                      <li>
                        <span className="text-white/40">1.</span> Settings →
                        Connectors
                      </li>
                      <li>
                        <span className="text-white/40">2.</span> Add custom
                        connector
                      </li>
                      <li>
                        <span className="text-white/40">3.</span> URL:{" "}
                        <span className="text-white">https://mcp.pay2.cash</span>
                      </li>
                    </ol>
                  </TerminalCard>
                )}

                {active && selected === "cursor" && (
                  <TerminalCard title="~/.cursor/mcp.json">
                    <pre className="whitespace-pre overflow-x-auto">
                      {CURSOR_JSON}
                    </pre>
                  </TerminalCard>
                )}

                {active && selected === "oss" && (
                  <TerminalCard title="bash">
                    <pre className="whitespace-pre-wrap break-words">
                      {OSS_SHELL}
                    </pre>
                  </TerminalCard>
                )}

                {active && isSkill && (
                  <TerminalCard title="project structure">
                    <p className="text-white/50 mb-3">
                      Place skill.md in your project&apos;s skills/ folder
                    </p>
                    <div className="leading-relaxed">
                      <div className="text-white/60">project/</div>
                      <div className="text-white/60 pl-4">skills/</div>
                      <div className="text-white/60 pl-8">pay2-cash/</div>
                      <div className="text-white pl-12">skill.md</div>
                    </div>
                  </TerminalCard>
                )}

                {active && (
                  <p className="mt-4 text-sm text-white/40 leading-relaxed">
                    Your agent can now pay with UPI (₹) or card (€).
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
