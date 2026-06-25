import { Badge } from "@/components/ui/badge";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ShieldCheck, Plane, CreditCard, Bot, Check } from "lucide-react";

export const metadata = {
  title: "Book a flight — pay2 Cash",
  description:
    "Let your AI agent book a flight within a budget. pay2 Cash issues a single-use card, pays the airline, then cancels the card.",
};

export default function FlyPage() {
  return (
    <>
      <SiteNav current="/fly" />
      <section className="relative px-4 pt-28 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[2%] via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-6xl mx-auto text-center">
          <Badge
            variant="outline"
            className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
          >
            Integration · Flights · EU
          </Badge>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-[-0.02em] text-white max-w-3xl mx-auto">
            Book a flight with your agent
          </h1>
          <p className="mt-4 text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
            Just ask. Your agent finds the fare and pays with a single-use virtual card
            capped at the ticket price — destroyed straight after the charge.
          </p>
        </div>
      </section>

      <section className="relative px-4 pb-24">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            <ChatCard />
            <BookingPanel />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-10">
            <Step
              icon={<Plane className="size-4 text-white/60" />}
              title="Ask"
              body="Tell your agent the route, dates and a budget."
            />
            <Step
              icon={<CreditCard className="size-4 text-white/60" />}
              title="Single-use card"
              body="Issued and capped at exactly the fare."
            />
            <Step
              icon={<ShieldCheck className="size-4 text-white/60" />}
              title="Pay & cancel"
              body="Airline paid, card destroyed after booking."
            />
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}

function ChatCard() {
  return (
    <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-full bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
            <Bot className="size-4 text-white/60" />
          </div>
          <div>
            <p className="text-xs text-white/50 font-medium">Assistant</p>
            <p className="text-[10px] text-white/30 font-mono">online</p>
          </div>
        </div>
        <div className="flex gap-1">
          <div className="size-1.5 rounded-full bg-white/20" />
          <div className="size-1.5 rounded-full bg-white/20" />
          <div className="size-1.5 rounded-full bg-white/20" />
        </div>
      </div>

      <div className="flex flex-col gap-4 flex-1 justify-end">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white text-black px-4 py-2.5 text-sm leading-relaxed">
            Book me a flight Paris → Berlin next month, under €80 ✈️
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[4%] ring-1 ring-white/[6%] text-white/80 px-4 py-2.5 text-sm leading-relaxed">
            Found a direct on Air France, CDG → BER —{" "}
            <span className="font-medium text-white">€59.09</span>. Book it?
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white text-black px-4 py-2.5 text-sm leading-relaxed">
            Yes, go ahead
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[4%] ring-1 ring-white/[6%] text-white/80 px-4 py-2.5 text-sm leading-relaxed">
            Booked ✓ Your reference is <span className="font-medium text-white">ABUOPV</span>.
            Paid with a single-use card that&apos;s now cancelled.
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingPanel() {
  return (
    <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-white/30 uppercase tracking-[0.12em] mb-1">Booking</p>
          <h3 className="text-xl font-semibold tracking-[-0.01em] text-white">Confirmed</h3>
        </div>
        <div className="size-9 rounded-full bg-emerald-400/10 flex items-center justify-center ring-1 ring-emerald-400/20">
          <Check className="size-4 text-emerald-400" />
        </div>
      </div>

      <div className="rounded-xl border border-white/[8%] bg-white/[3%] p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
              <Plane className="size-4 text-white/60" />
            </div>
            <div>
              <p className="text-white/90 text-sm font-medium">Air France</p>
              <p className="text-xs text-white/40 font-mono">CDG 08:25 → BER 10:05 · direct</p>
            </div>
          </div>
          <span className="text-white font-semibold">€59.09</span>
        </div>
      </div>

      <div className="rounded-xl border border-white/[8%] bg-white/[3%] p-4 space-y-2.5 flex-1">
        <Row label="Booking ref (PNR)" value="ABUOPV" mono />
        <Row label="Paid" value="€59.09" />
        <Row
          label="Card"
          value="•••• 0021"
          mono
          icon={<CreditCard className="size-3.5 text-white/40" />}
        />
        <Row label="Card status" value="Cancelled ✓" />
      </div>

      <div className="mt-6 pt-4 border-t border-white/[6%] flex items-center justify-center gap-2 text-xs text-white/30">
        <ShieldCheck className="size-4 text-emerald-400" />
        Single-use card · routed via pay2 Cash
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/30">{label}</span>
      <span className={`text-white/80 flex items-center gap-1.5 ${mono ? "font-mono" : ""}`}>
        {icon}
        {value}
      </span>
    </div>
  );
}

function Step({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-white/[6%] bg-white/[1%] p-4">
      <div className="size-8 rounded-lg bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%] mb-3">
        {icon}
      </div>
      <p className="text-white/80 text-sm font-medium">{title}</p>
      <p className="text-xs text-white/30 mt-0.5 leading-relaxed">{body}</p>
    </div>
  );
}
