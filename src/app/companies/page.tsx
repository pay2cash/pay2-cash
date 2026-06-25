"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Smartphone,
  ShieldCheck,
  Check,
  ArrowRight,
} from "lucide-react";

const PAY_METHODS = [
  {
    icon: CreditCard,
    title: "Europe → corporate card",
    body: "Issue virtual cards (€) per agent or team, each with its own limit.",
  },
  {
    icon: Smartphone,
    title: "India → UPI",
    body: "Route payments from your company UPI VPA. Authorise the mandate once; agents spend within it.",
  },
  {
    icon: ShieldCheck,
    title: "Controls built in",
    body: "Per-merchant limits, one-time mandates, and every payment logged for finance.",
  },
];

const CONTROLS = [
  "Per-agent limits",
  "Per-merchant rules",
  "One-time mandates",
  "Audit log",
  "Reserve Pay",
];

export default function Page() {
  const [method, setMethod] = useState<"upi" | "card">("upi");

  return (
    <>
      <SiteNav current="/companies" />
      <main className="pt-16">
        {/* Hero */}
        <section className="relative pt-28 pb-20 px-4">
          <div className="max-w-6xl mx-auto">
            <Badge
              variant="outline"
              className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
            >
              Companies
            </Badge>
            <h1 className="text-[clamp(2.2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white max-w-3xl">
              Payment rails for your company&apos;s agents.
            </h1>
            <p className="text-lg text-white/40 leading-relaxed mt-6 max-w-2xl">
              Let your business AI agents buy what they need — with spend limits,
              approvals, and a full audit trail. Pay by UPI or corporate card.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-8">
              <Link href="/merchant">
                <Button className="h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 font-medium gap-2">
                  Talk to us
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/get-started">
                <Button
                  variant="outline"
                  className="h-12 px-8 rounded-full border-white/[8%] bg-transparent text-white/70 hover:bg-white/[4%] hover:text-white font-medium"
                >
                  Get started
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* How your company pays */}
        <section className="relative py-24 sm:py-32 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
              How your company pays
            </h2>
            <p className="text-lg text-white/40 leading-relaxed mt-4 max-w-2xl">
              One layer for every region your agents operate in.
            </p>
            <div className="grid md:grid-cols-3 gap-5 mt-12">
              {PAY_METHODS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 transition-all duration-300 hover:border-white/[10%] hover:bg-white/[3%]"
                >
                  <div className="size-11 rounded-xl bg-white/[3%] ring-1 ring-white/[6%] flex items-center justify-center mb-5">
                    <Icon className="size-5 text-white/70" />
                  </div>
                  <h3 className="text-lg font-semibold text-white tracking-[-0.01em]">
                    {title}
                  </h3>
                  <p className="text-sm text-white/40 leading-relaxed mt-2">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* See it in action */}
        <section className="relative py-24 sm:py-32 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
              See it in action
            </h2>
            <p className="text-lg text-white/40 leading-relaxed mt-4 max-w-2xl">
              An agent finds the supplier. Finance keeps control.
            </p>

            <div className="grid lg:grid-cols-2 gap-5 mt-12 items-start">
              {/* Chat */}
              <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 space-y-4">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white text-black px-4 py-3 text-sm leading-relaxed">
                    Order 50 terry towels for the office washrooms, keep it under
                    ₹40,000
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[4%] ring-1 ring-white/[6%] text-white/80 px-4 py-3 text-sm leading-relaxed">
                    Found a bulk supplier — 50 towels at ₹620 each = ₹31,000.
                    Within budget. Pay now?
                  </div>
                </div>
              </div>

              {/* Checkout */}
              <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6">
                {/* Toggle */}
                <div className="inline-flex p-1 rounded-full bg-white/[3%] ring-1 ring-white/[6%] mb-6">
                  <button
                    type="button"
                    onClick={() => setMethod("upi")}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                      method === "upi"
                        ? "bg-white text-black"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    Company UPI
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("card")}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                      method === "card"
                        ? "bg-white text-black"
                        : "text-white/50 hover:text-white"
                    }`}
                  >
                    Corporate card
                  </button>
                </div>

                {method === "upi" ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-white/40 font-medium mb-2">
                        Enter your company UPI VPA
                      </label>
                      <div className="rounded-xl border border-white/[8%] bg-white/[3%] p-4 font-mono text-sm text-white/70">
                        finance@company
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-white/[3%] ring-1 ring-white/[4%] px-4 py-3">
                      <span className="text-xs text-white/40 font-medium">
                        Amount
                      </span>
                      <span className="text-sm font-semibold text-white">
                        ₹31,000
                      </span>
                    </div>
                    <Button className="w-full h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 font-medium gap-2">
                      Pay by UPI
                    </Button>
                    <p className="text-[11px] text-white/30 text-center">
                      Approver gets the request in the UPI app
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-white/40 font-medium mb-2">
                        Corporate card
                      </label>
                      <div className="flex items-center justify-between rounded-xl border border-white/[8%] bg-white/[3%] p-4 font-mono text-sm text-white/70">
                        <span>•••• 0005</span>
                        <span>€340.00</span>
                      </div>
                    </div>
                    <Button className="w-full h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 font-medium gap-2">
                      Pay with card
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 mt-6 pt-5 border-t border-white/[6%]">
                  <Check className="size-4 text-emerald-400" />
                  <span className="text-xs text-white/40">
                    Split &amp; settled via pay2 Cash
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Spend controls */}
        <section className="relative py-24 sm:py-32 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
              Spend controls
            </h2>
            <p className="text-lg text-white/40 leading-relaxed mt-4 max-w-2xl">
              Set the guardrails once. Every agent stays inside them.
            </p>
            <div className="flex flex-wrap gap-3 mt-12">
              {CONTROLS.map((control) => (
                <div
                  key={control}
                  className="flex items-center gap-2 rounded-2xl border border-white/[6%] bg-white/[2%] px-5 py-4 transition-all duration-300 hover:border-white/[10%] hover:bg-white/[3%]"
                >
                  <Check className="size-4 text-emerald-400" />
                  <span className="text-sm text-white/70 font-medium">
                    {control}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative py-24 sm:py-32 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-10 sm:p-14 text-center">
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
                Give your agents a budget, not a blank cheque.
              </h2>
              <p className="text-lg text-white/40 leading-relaxed mt-4 max-w-xl mx-auto">
                Talk to us about rolling out pay2 Cash across your company&apos;s
                agents.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
                <Link href="/merchant">
                  <Button className="h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 font-medium gap-2">
                    Talk to us
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
                <Link href="/get-started">
                  <Button
                    variant="outline"
                    className="h-12 px-8 rounded-full border-white/[8%] bg-transparent text-white/70 hover:bg-white/[4%] hover:text-white font-medium"
                  >
                    Get started
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
