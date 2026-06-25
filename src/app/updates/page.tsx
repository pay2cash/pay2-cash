import { Badge } from "@/components/ui/badge";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

const CHANGELOG = [
  {
    date: "June 2026",
    title: "Stripe Issuing live",
    description:
      "Issue virtual cards (€) to agents in the EU, with per-card spend limits.",
  },
  {
    date: "June 2026",
    title: "Split Settlement for merchants",
    description:
      "Onboard operators as PayU child merchants; every order splits straight to them.",
  },
  {
    date: "May 2026",
    title: "UPI Reserve Pay mandates",
    description:
      "Users authorise a spend limit once; agents pay within it — no PIN per transaction.",
  },
  {
    date: "May 2026",
    title: "CiCi Label joins",
    description: "Our first fashion partner goes live for agent shopping.",
  },
  {
    date: "April 2026",
    title: "MCP server launches",
    description: "Connect any AI agent at mcp.pay2.cash.",
  },
];

export default function Page() {
  return (
    <>
      <SiteNav current="/updates" />
      <main className="pt-16">
        <section className="relative pt-28 pb-20 px-4">
          <div className="max-w-3xl mx-auto">
            <Badge
              variant="outline"
              className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
            >
              Updates
            </Badge>
            <h1 className="text-[clamp(2.2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
              What&apos;s new
            </h1>
            <p className="mt-6 text-lg text-white/40 leading-relaxed">
              Product updates from pay2 Cash.
            </p>
          </div>
        </section>

        <section className="relative py-24 sm:py-32 px-4">
          <div className="max-w-3xl mx-auto flex flex-col gap-5">
            {CHANGELOG.map((entry) => (
              <article
                key={`${entry.date}-${entry.title}`}
                className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 transition-all duration-300 hover:border-white/[10%] hover:bg-white/[3%]"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
                  <div className="shrink-0 sm:w-32 sm:pt-0.5">
                    <span className="font-[family-name:var(--font-geist-mono)] text-sm text-white/40">
                      {entry.date}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">
                      {entry.title}
                    </h2>
                    <p className="mt-2 text-lg text-white/40 leading-relaxed">
                      {entry.description}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
