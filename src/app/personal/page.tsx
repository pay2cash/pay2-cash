"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  Smartphone,
  Store,
  Check,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { AgentExamples, type AgentExample } from "@/components/agent-examples";

const PERSONAL_EXAMPLES: AgentExample[] = [
  {
    tag: "Grocery · Kirana",
    user: "Order 2kg atta, a dozen eggs and milk from a kirana near me",
    agent: "Found a kirana 0.8km away on ONDC — ₹318 total. Pay by UPI?",
  },
  {
    tag: "Flights",
    user: "Book the cheapest flight Delhi → Goa this Friday",
    agent: "IndiGo 6E-204, ₹4,210 incl. taxes. Approve to book?",
  },
  {
    tag: "Food",
    user: "Get me a masala dosa and a filter coffee from somewhere close",
    agent: "Ordered from a place 1.2km away on ONDC — ₹190. Pay?",
  },
  {
    tag: "Fashion",
    user: "Find a cotton kurta under ₹1,500",
    agent: "Spotted one from a local label on ONDC — ₹1,299. Want it?",
  },
  {
    tag: "Pharmacy",
    user: "Order paracetamol and a digital thermometer",
    agent: "Both at a chemist nearby on ONDC — ₹245. Pay by UPI?",
  },
  {
    tag: "Mobility",
    user: "Book an auto to the railway station",
    agent: "Auto booked via ONDC mobility — ₹85 fare. Confirm?",
  },
];

export default function Page() {
  return (
    <>
      <SiteNav current="/personal" />
      <main className="pt-16">
        <Hero />
        <HowYouPay />
        <SeeItInAction />
        <CTA />
      </main>
      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <section className="relative pt-28 pb-20 px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[2%] via-transparent to-transparent pointer-events-none" />
      <div className="relative z-10 max-w-6xl mx-auto text-center flex flex-col items-center">
        <Badge
          variant="outline"
          className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
        >
          Personal
        </Badge>
        <h1 className="text-[clamp(2.2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white max-w-3xl">
          Your agent shops. You stay in control.
        </h1>
        <p className="mt-6 text-lg text-white/40 leading-relaxed max-w-xl">
          Let your AI assistant order things for you — and pay safely with UPI or
          a virtual card. You approve, it pays.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {["UPI in India (₹)", "Virtual card in Europe (€)"].map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[8%] bg-white/[3%] px-3.5 py-1.5 text-xs font-medium text-white/70"
            >
              <Check className="size-3.5 text-emerald-400" />
              {c}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowYouPay() {
  const cards = [
    {
      icon: CreditCard,
      title: "In Europe → debit card",
      description:
        "Get a virtual debit card (€). Your agent pays with it at any online checkout; you set the limit.",
      tags: ["EUR", "Set the limit"],
    },
    {
      icon: Smartphone,
      title: "In India → UPI",
      description:
        "Enter your UPI VPA with the service provider. You authorise once, and the payment gets routed to the merchant.",
      tags: ["INR", "Authorise once"],
    },
    {
      icon: Store,
      title: "Not integrated with us?",
      description:
        "For merchants we don't directly support yet, they collect the payment directly from you — pay2 Cash just hands off securely.",
      tags: ["Secure hand-off"],
    },
  ];

  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <Badge
            variant="outline"
            className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
          >
            Personal
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
            How you pay
          </h2>
          <p className="mt-4 text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
            One simple flow, the right rail for wherever you are.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 transition-all duration-300 hover:border-white/[10%] hover:bg-white/[3%]"
              >
                <div className="size-11 rounded-xl bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%] mb-5">
                  <Icon className="size-5 text-white/70" />
                </div>
                <h3 className="text-lg font-semibold tracking-[-0.01em] text-white mb-2">
                  {card.title}
                </h3>
                <p className="text-sm text-white/40 leading-relaxed mb-5">
                  {card.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {card.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-lg bg-white/[3%] ring-1 ring-white/[4%] text-[11px] text-white/40 font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SeeItInAction() {
  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <Badge
            variant="outline"
            className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
          >
            Personal
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
            See it in action
          </h2>
          <p className="mt-4 text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
            You chat, your agent finds it, and you approve the payment — your way.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          <AgentExamples examples={PERSONAL_EXAMPLES} />
          <CheckoutPanel />
        </div>
      </div>
    </section>
  );
}

function CheckoutPanel() {
  const [method, setMethod] = useState<"upi" | "card">("upi");

  return (
    <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-white/30 uppercase tracking-[0.12em] mb-1">
            Checkout
          </p>
          <h3 className="text-xl font-semibold tracking-[-0.01em] text-white">
            Pay
          </h3>
        </div>
        <div className="size-9 rounded-full bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
          <CreditCard className="size-4 text-white/60" />
        </div>
      </div>

      <div className="inline-flex p-1 rounded-xl bg-white/[3%] ring-1 ring-white/[4%] mb-6">
        <button
          type="button"
          onClick={() => setMethod("upi")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
            method === "upi"
              ? "bg-white text-black"
              : "text-white/50 hover:text-white"
          }`}
        >
          <Smartphone className="size-4" />
          UPI
          <span className="text-[10px] font-normal opacity-60">India</span>
        </button>
        <button
          type="button"
          onClick={() => setMethod("card")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
            method === "card"
              ? "bg-white text-black"
              : "text-white/50 hover:text-white"
          }`}
        >
          <CreditCard className="size-4" />
          Card
          <span className="text-[10px] font-normal opacity-60">EU</span>
        </button>
      </div>

      <div className="flex-1">
        {method === "upi" ? (
          <div className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="upi-vpa"
                className="block text-xs text-white/40 font-medium mb-2"
              >
                Enter your UPI VPA
              </label>
              <input
                id="upi-vpa"
                type="text"
                placeholder="yourname@bank"
                className="w-full rounded-xl border border-white/[8%] bg-white/[3%] px-4 py-3 font-mono text-sm text-white/80 placeholder:text-white/25 outline-none transition-all focus:border-white/[16%] focus:bg-white/[4%]"
              />
            </div>
            <p className="text-xs text-white/30 leading-relaxed">
              You&apos;ll approve the request in your UPI app.
            </p>
            <div className="flex items-center justify-between rounded-xl border border-white/[8%] bg-white/[3%] p-4">
              <span className="text-sm text-white/40">Amount</span>
              <span className="font-mono text-base font-medium text-white">
                ₹1,299
              </span>
            </div>
            <Button className="h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 font-medium gap-2 w-full">
              Approve in UPI app
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-white/40 font-medium">
              Your virtual card
            </p>
            <div className="rounded-xl border border-white/[8%] bg-white/[3%] p-4 font-mono text-sm text-white/70 flex items-center justify-between">
              <span className="flex items-center gap-3">
                <CreditCard className="size-4 text-white/50" />
                •••• 0005
              </span>
              <span className="text-white">€14.50</span>
            </div>
            <p className="text-xs text-white/30 leading-relaxed">
              Charged to your virtual debit card, within the limit you set.
            </p>
            <Button className="h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 font-medium gap-2 w-full">
              Pay with card
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-white/[6%] flex items-center justify-center gap-2 text-xs text-white/30">
        <Check className="size-4 text-emerald-400" />
        Routed via pay2 Cash
      </div>
    </div>
  );
}

function CTA() {
  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="relative overflow-hidden rounded-2xl border border-white/[6%] bg-white/[2%] px-6 py-16 sm:py-20 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[3%] via-transparent to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="size-11 rounded-xl bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%] mb-6">
              <ShieldCheck className="size-5 text-white/70" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
              Get started
            </h2>
            <p className="mt-4 text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
              Set up your virtual card or link your UPI VPA in a minute. You stay
              in control of every payment.
            </p>
            <div className="mt-8">
              <Link href="/get-started">
                <Button className="h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 font-medium gap-2">
                  Get started
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
