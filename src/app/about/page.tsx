import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ShoppingBag, Store, ArrowRight } from "lucide-react";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

const SHOPPER_POINTS = [
  "Authorise once with a UPI mandate or a virtual card.",
  "Your agent spends only within the limits you set.",
  "Pay in ₹ INR or € EUR, no PIN per transaction.",
];

const MERCHANT_POINTS = [
  "Onboard once as a PayU child merchant.",
  "Get listed in the MCP so any agent can find you.",
  "Get paid instantly via split settlement on every order.",
];

const BUILT_ON = [
  "UPI Reserve Pay",
  "Stripe Issuing",
  "PayU Split Settlement",
  "MCP",
  "₹ INR",
  "€ EUR",
];

export default function Page() {
  return (
    <>
      <SiteNav current="/about" />
      <main className="pt-16">
        <section className="relative pt-28 pb-20 px-4">
          <div className="max-w-3xl mx-auto">
            <Badge
              variant="outline"
              className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
            >
              About
            </Badge>
            <h1 className="text-[clamp(2.2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
              Payment rails for AI agents.
            </h1>
            <p className="mt-6 text-lg text-white/40 leading-relaxed">
              pay2 Cash is the payment layer for agentic commerce — so AI agents
              can buy, and merchants can sell, safely.
            </p>
          </div>
        </section>

        <section className="relative py-24 sm:py-32 px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
              What we believe
            </h2>
            <p className="mt-6 text-lg text-white/40 leading-relaxed">
              Soon, people won&apos;t click through checkout flows — they&apos;ll
              shop by talking to an AI. The agent finds the product, compares the
              options, and places the order. But payments were built for humans
              with thumbs and phones, not for software acting on someone&apos;s
              behalf.
            </p>
            <p className="mt-4 text-lg text-white/40 leading-relaxed">
              We think the rails need to work for agents — with limits, mandates,
              and accountability built in — so a person can hand off spending to an
              AI without handing over their wallet. That is the layer we are
              building.
            </p>
          </div>
        </section>

        <section className="relative py-24 sm:py-32 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
              How it works
            </h2>
            <p className="mt-6 text-lg text-white/40 leading-relaxed max-w-3xl">
              One payment layer, two sides — buyers who let their agents spend,
              and merchants who get paid for it.
            </p>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 transition-all duration-300 hover:border-white/[10%] hover:bg-white/[3%]">
                <div className="flex size-11 items-center justify-center rounded-xl bg-white/[3%] ring-1 ring-white/[6%]">
                  <ShoppingBag className="size-5 text-white/70" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.01em] text-white">
                  For shoppers &amp; companies
                </h3>
                <p className="mt-2 text-lg text-white/40 leading-relaxed">
                  Authorise once with a UPI mandate or a virtual card. Your agent
                  spends within the limits you set — nothing more.
                </p>
                <ul className="mt-6 flex flex-col gap-3">
                  {SHOPPER_POINTS.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <Check className="size-4 text-emerald-400 mt-1 shrink-0" />
                      <span className="text-white/50">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 transition-all duration-300 hover:border-white/[10%] hover:bg-white/[3%]">
                <div className="flex size-11 items-center justify-center rounded-xl bg-white/[3%] ring-1 ring-white/[6%]">
                  <Store className="size-5 text-white/70" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.01em] text-white">
                  For merchants
                </h3>
                <p className="mt-2 text-lg text-white/40 leading-relaxed">
                  Onboard once, get listed in the MCP so any agent can discover
                  you, and get paid via split settlement.
                </p>
                <ul className="mt-6 flex flex-col gap-3">
                  {MERCHANT_POINTS.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <Check className="size-4 text-emerald-400 mt-1 shrink-0" />
                      <span className="text-white/50">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="relative py-24 sm:py-32 px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
              Built on
            </h2>
            <p className="mt-6 text-lg text-white/40 leading-relaxed">
              Proven rails, wired together for agentic commerce.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {BUILT_ON.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-lg bg-white/[3%] ring-1 ring-white/[4%] text-[11px] text-white/40 font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="relative py-24 sm:py-32 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 sm:p-10 transition-all duration-300 hover:border-white/[10%] hover:bg-white/[3%]">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
                Ready when your agent is.
              </h2>
              <p className="mt-4 text-lg text-white/40 leading-relaxed">
                Give your AI agent payment rails, or list your store for the
                agents already shopping.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/get-started">
                  <Button className="h-11 w-full rounded-full bg-white text-black hover:bg-white/90 font-medium transition-all duration-200 sm:w-auto">
                    Get started
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
                <Link href="/merchant">
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-full border-white/[8%] bg-transparent text-white/70 hover:bg-white/[4%] hover:text-white font-medium transition-all duration-200 sm:w-auto"
                  >
                    Become a partner
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
