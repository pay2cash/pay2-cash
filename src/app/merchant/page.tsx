import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Check,
  Store,
  Network,
  Bot,
  Wallet,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { OnboardingForm } from "@/components/onboarding-form";

export default function Page() {
  return (
    <>
      <SiteNav current="/merchant" />
      <main className="pt-16">
        <Hero />
        <HowItWorks />
        <WhyNow />
        <WhoWeOnboard />
        <CTA />
      </main>
      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <section className="relative pt-28 pb-20 px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[3%] via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-white/[1%] rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-3xl mx-auto text-center">
        <Badge
          variant="outline"
          className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
        >
          Merchants
        </Badge>
        <h1 className="text-[clamp(2.2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
          Join the party.
        </h1>
        <p className="mt-6 text-lg text-white/40 leading-relaxed max-w-2xl mx-auto">
          If you haven&apos;t heard — soon we&apos;ll all be shopping just by
          chatting to our computers. When that happens, be where the agents buy.
          pay2 Cash puts your store in front of every AI.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="#apply">
            <Button className="h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 font-medium gap-2">
              Apply to onboard
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <span className="text-sm text-white/30 font-medium">
            No new payments licence needed
          </span>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    icon: Store,
    title: "Onboard once",
    description:
      "We set you up as a PayU child merchant. PayU handles KYC, the nodal account, and settlement.",
  },
  {
    icon: Network,
    title: "Get listed in the MCP",
    description:
      "Your store becomes reachable by any AI agent through the pay2 Cash MCP (mcp.pay2.cash).",
  },
  {
    icon: Bot,
    title: "Agents buy on behalf of users",
    description:
      "Shoppers tell their AI what they want; the agent checks out with pay2 Cash.",
  },
  {
    icon: Wallet,
    title: "You get paid — split settled",
    description:
      "Each order splits straight to you (your share) plus our small fee. No new payments licence needed.",
  },
];

function HowItWorks() {
  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <Badge
            variant="outline"
            className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
          >
            How it works
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
            How it works for you
          </h2>
          <p className="mt-4 text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
            From sign-up to settlement — four steps and the agents start buying.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 transition-all duration-300 hover:border-white/[10%] hover:bg-white/[3%]"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="size-10 rounded-xl bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
                    <Icon className="size-5 text-white/70" />
                  </div>
                  <span className="text-4xl font-bold text-white/[4%] select-none leading-none">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="text-lg font-semibold tracking-[-0.01em] text-white mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-white/40 leading-relaxed">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WhyNow() {
  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <Badge
          variant="outline"
          className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
        >
          Why now
        </Badge>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
          The shelf is being built right now.
        </h2>
        <p className="mt-6 text-lg text-white/40 leading-relaxed">
          Agentic commerce is arriving fast. In a year, a huge share of orders
          won&apos;t start in a browser tab — they&apos;ll start in a
          conversation. The merchants who show up early own the shelf the agents
          reach for first.
        </p>
        <p className="mt-4 text-lg text-white/40 leading-relaxed">
          Onboard now and you&apos;re not just a listing — you become our
          partner. We grow the agent demand; you bring the products worth buying.
          Early partners get the prime placement, the introductions, and the
          head start that&apos;s impossible to buy later.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {[
            "Own the shelf early",
            "Become our partner",
            "Grow with agent demand",
          ].map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-2 text-sm text-white/50"
            >
              <Check className="size-4 text-emerald-400" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhoWeOnboard() {
  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <Badge
            variant="outline"
            className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
          >
            Who we&apos;re onboarding
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
            If you&apos;re selling something cool, we want you.
          </h2>
        </div>

        <div className="relative rounded-2xl border border-white/[10%] bg-gradient-to-br from-white/[3%] via-white/[2%] to-transparent p-8 sm:p-10 transition-all duration-300 hover:border-white/[14%]">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/[2%] rounded-full -translate-y-1/3 translate-x-1/3 blur-3xl pointer-events-none" />

          <div className="relative">
            <div className="size-11 rounded-xl bg-white/[5%] flex items-center justify-center ring-1 ring-white/[8%] mb-6">
              <Sparkles className="size-5 text-white/70" />
            </div>
            <p className="text-xl sm:text-2xl font-medium leading-relaxed text-white/90">
              We&apos;re currently onboarding fashion and local-tier brands in
              India 🇮🇳 and the EU 🇪🇺 — if you&apos;re selling something cool, we
              want you.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {["Fashion", "Apparel", "Local brands", "India", "EU"].map(
                (tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded-lg bg-white/[3%] ring-1 ring-white/[4%] text-[11px] text-white/40 font-medium"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>

            <div className="mt-8 pt-7 border-t border-white/[6%] flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex items-center gap-3">
                <Check className="size-4 text-emerald-400 shrink-0" />
                <p className="text-sm text-white/50 leading-relaxed">
                  <span className="text-white/80 font-medium">CiCi Label</span>{" "}
                  is our first fashion partner — already live on pay2 Cash.
                </p>
              </div>
              <a
                href="https://cicilabel.com"
                className="text-sm text-white/40 hover:text-white transition-colors duration-200 shrink-0"
              >
                cicilabel.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section id="apply" className="relative py-24 sm:py-32 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-white/[3%] via-transparent to-transparent pointer-events-none" />
      {/* subtle grid background, fades out toward the edges */}
      <div className="absolute inset-0 opacity-[0.18] pointer-events-none [background-image:linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
      <div className="relative max-w-3xl mx-auto text-center">
        <h2 className="text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
          Be where the agents buy.
        </h2>
        <p className="mt-6 text-lg text-white/40 leading-relaxed max-w-xl mx-auto">
          Join the first wave of brands selling through AI. Onboarding is quick,
          and there&apos;s no new payments licence to chase.
        </p>

        <div className="mt-12">
          <OnboardingForm />
        </div>

        <p className="mt-6 text-sm text-white/30 font-medium">
          Sell through any AI. Get paid in INR (₹) or EUR (€).
        </p>
      </div>
    </section>
  );
}
