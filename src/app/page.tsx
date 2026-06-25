import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, ArrowRight, Check, X, Smartphone, Bot, Plane } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <>
      <SiteNav current="/" />
      <Hero />
      <SafeSection />
      <IntegrationsSection />
      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[2%] via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-white/[1%] via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/[1%] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-white/[1%] rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-8 px-4 max-w-6xl mx-auto">
        <div className="animate-fade-in-up">
          <Badge
            variant="outline"
            className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide"
          >
            Powered by pay2 Cash
          </Badge>
        </div>

        <div className="text-center animate-fade-in-up animate-delay-100">
          <p className="text-[clamp(3rem,15vw,8rem)] font-bold leading-none tracking-[-0.03em] text-white select-none">
            pay2 Cash
          </p>
        </div>

        <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-white/90 text-center max-w-3xl animate-fade-in-up animate-delay-200">
          Give payment rails to your AI Agent
        </h1>

        <p className="text-lg sm:text-xl text-white/40 text-center max-w-xl leading-relaxed animate-fade-in-up animate-delay-300">
          including debit card, and UPI payments. One integration, all the
          payment methods your agent needs.
        </p>

        <div className="flex items-center gap-2.5 animate-fade-in-up animate-delay-300">
          {["INR supported", "EUR supported"].map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[8%] bg-white/[3%] px-3.5 py-1.5 text-xs font-medium text-white/70"
            >
              <Check className="size-3.5 text-emerald-400" />
              {c}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-4 mt-2 animate-fade-in-up animate-delay-400">
          <Button className="h-12 px-8 rounded-full bg-white text-black hover:bg-white/90 font-medium text-base gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
            Get started now
            <ArrowRight className="size-4" />
          </Button>
          <span className="text-sm text-white/30 font-medium">1 min setup</span>
        </div>

        <div className="mt-8 w-full max-w-lg animate-scale-in animate-delay-500">
          <VirtualCard />
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-fade-in animate-delay-1000">
        <div className="size-5 rounded-full border border-white/[8%] flex items-center justify-center animate-bounce">
          <div className="size-1 rounded-full bg-white/20" />
        </div>
      </div>
    </section>
  );
}

function VirtualCard() {
  return (
    <div className="relative group">
      <div className="relative w-full aspect-[1.586/1] rounded-2xl bg-gradient-to-br from-zinc-800 via-zinc-900 to-black shadow-2xl shadow-white/[2%] ring-1 ring-white/[6%] transition-all duration-500 hover:shadow-white/[6%] hover:-translate-y-1 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/[6%] via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-white/[3%] via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/[2%] rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/[2%] rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between h-full p-5 sm:p-6 lg:p-8">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] sm:text-xs font-medium text-white/40 uppercase tracking-[0.12em]">
                Virtual Card
              </span>
              <span className="text-white/60 text-sm font-medium">
                pay2 Cash
              </span>
            </div>
            <div className="size-9 rounded-full bg-white/[4%] backdrop-blur-sm flex items-center justify-center ring-1 ring-white/[6%]">
              <CreditCard className="size-4 text-white/60" />
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-lg sm:text-xl md:text-2xl font-mono tracking-[0.18em] text-white/80">
              •••• •••• •••• 4829
            </p>
            <div className="flex items-center gap-8 sm:gap-12">
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.12em]">
                  Expires
                </p>
                <p className="text-sm font-mono text-white/70">12/28</p>
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.12em]">
                  CVV
                </p>
                <p className="text-sm font-mono text-white/70">•••</p>
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.12em]">
                  Balance
                </p>
                <p className="text-sm font-mono text-white/70">₹20,000.00</p>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 right-0 p-5 sm:p-6 lg:p-8 flex items-end justify-end gap-2">
            <div className="px-2.5 h-9 rounded-full bg-white/[6%] backdrop-blur-sm flex items-center justify-center ring-1 ring-white/[8%]">
              <span className="text-[11px] font-semibold tracking-[0.14em] text-white/70">
                UPI
              </span>
            </div>
            <div className="size-9 rounded-full bg-white/[4%] backdrop-blur-sm flex items-center justify-center ring-1 ring-white/[6%]">
              <CreditCard className="size-4 text-white/40" />
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[8%] to-transparent" />
      </div>
    </div>
  );
}

function SafeSection() {
  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20 animate-fade-in-up">
          <Badge
            variant="outline"
            className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
          >
            Is it Safe?
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
            Safety built into every payment
          </h2>
          <p className="mt-4 text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
            Your money, your rules. Every payment method is designed with
            protection first.
          </p>
        </div>

        <div className="flex flex-col gap-16">
          <SafeFeature
            number="01"
            title="Disposable Cards"
            description="Single-use virtual debit cards that self-destruct after one charge. Fund them in seconds — your real card details are never exposed to your agent."
            mockup={<DisposableCardMockup />}
          />
          <SafeFeature
            number="02"
            title="User Authorised Transaction"
            description="Every UPI payment and debit card charge needs your approval. Get a real-time notification, review the details, and authorize or deny — all before any money moves."
            mockup={<AuthorisationMockup />}
          />
          <SafeFeature
            number="03"
            title="Works with Any Agent"
            description="Drop-in integration with Claude, ChatGPT, Cursor, and any MCP-compatible runtime. Your agent gets payment abilities without sharing your credentials."
            mockup={<AiConnectionsMockup />}
          />
        </div>
      </div>
    </section>
  );
}

function SafeFeature({
  number,
  title,
  description,
  mockup,
}: {
  number: string;
  title: string;
  description: string;
  mockup: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
      <div className="order-2 lg:order-1 animate-fade-in-up">
        <span className="text-5xl sm:text-6xl font-bold text-white/[3%] select-none">
          {number}
        </span>
        <h3 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] text-white mt-2 mb-4">
          {title}
        </h3>
        <p className="text-base sm:text-lg text-white/40 leading-relaxed max-w-md">
          {description}
        </p>
      </div>
      <div className="order-1 lg:order-2 flex justify-center animate-scale-in">
        {mockup}
      </div>
    </div>
  );
}

function DisposableCardMockup() {
  return (
    <div className="relative w-full max-w-sm">
      <div className="rounded-2xl border border-white/[6%] bg-white/[1%] p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-white/20 animate-pulse" />
            <span className="text-xs text-white/30 font-mono">active</span>
          </div>
          <div className="flex items-center gap-1.5 text-white/20 text-xs">
            <span className="size-1.5 rounded-full bg-white/20" />
            <span className="size-1.5 rounded-full bg-white/20" />
            <span className="size-1.5 rounded-full bg-white/20" />
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-[0.12em] mb-1">
              Single Use Card
            </p>
            <p className="font-mono text-lg tracking-[0.15em] text-white/80">
              •••• 4829
            </p>
          </div>
          <div className="size-10 rounded-lg bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
            <CreditCard className="size-5 text-white/60" />
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/30">Amount</span>
            <span className="text-white/80 font-mono">₹2,000.00</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/30">Merchant</span>
            <span className="text-white/70">API Service</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/30">Status</span>
            <span className="text-white/60 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-white/40" />
              Processing
            </span>
          </div>
        </div>

        <div className="h-1.5 rounded-full bg-white/[4%] overflow-hidden">
          <div className="h-full w-3/4 rounded-full bg-white/10 animate-pulse" />
        </div>

        <div className="mt-4 pt-4 border-t border-white/[4%] flex items-center justify-center gap-2 text-xs text-white/20">
          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Auto-destroys after charge
        </div>
      </div>

      <div className="absolute -bottom-3 -right-3 w-full h-full rounded-2xl border border-white/[3%] -z-10" />
      <div className="absolute -bottom-6 -right-6 w-full h-full rounded-2xl border border-white/[2%] -z-20" />
    </div>
  );
}

function AuthorisationMockup() {
  return (
    <div className="relative w-full max-w-sm">
      <div className="rounded-2xl border border-white/[6%] bg-white/[1%] p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
              <Smartphone className="size-4 text-white/60" />
            </div>
            <div>
              <p className="text-xs text-white/50 font-medium">pay2 Cash</p>
              <p className="text-[10px] text-white/30 font-mono">Approval Required</p>
            </div>
          </div>
          <div className="flex gap-1">
            <div className="size-1.5 rounded-full bg-white/20" />
            <div className="size-1.5 rounded-full bg-white/20" />
            <div className="size-1.5 rounded-full bg-white/20" />
          </div>
        </div>

        <div className="space-y-4 mb-6 p-4 rounded-xl bg-white/[2%] border border-white/[4%]">
          <div className="flex items-center gap-3">
            <Bot className="size-8 text-white/40" />
            <div>
              <p className="text-sm text-white/80 font-medium">Your AI Agent</p>
              <p className="text-xs text-white/30">wants to make a payment</p>
            </div>
          </div>
          <div className="h-px bg-white/[4%]" />
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-white/30">Amount</span>
              <span className="text-white/90 font-mono font-medium">₹3,500.00</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/30">Method</span>
              <span className="text-white/70">UPI</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/30">Merchant</span>
              <span className="text-white/70">api.example.com</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button className="flex-1 h-11 rounded-xl bg-white/5 text-white/50 border border-white/[6%] hover:bg-white/[4%] hover:text-white gap-2">
            <X className="size-4" />
            Deny
          </Button>
          <Button className="flex-1 h-11 rounded-xl bg-white text-black hover:bg-white/90 font-medium gap-2">
            <Check className="size-4" />
            Authorize
          </Button>
        </div>
      </div>

      <div className="absolute -bottom-3 -right-3 w-full h-full rounded-2xl border border-white/[3%] -z-10" />
      <div className="absolute -bottom-6 -right-6 w-full h-full rounded-2xl border border-white/[2%] -z-20" />
    </div>
  );
}

function AiConnectionsMockup() {
  const agents = [
    { name: "Claude", bg: "bg-white/[4%]" },
    { name: "ChatGPT", bg: "bg-white/[4%]" },
    { name: "Cursor", bg: "bg-white/[4%]" },
    { name: "Gemini", bg: "bg-white/[4%]" },
    { name: "Copilot", bg: "bg-white/[4%]" },
    { name: "MCP", bg: "bg-white/[6%]" },
  ];

  return (
    <div className="relative w-full max-w-sm">
      <div className="rounded-2xl border border-white/[6%] bg-white/[1%] p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-white/20" />
            <span className="text-xs text-white/30 font-mono">connections active</span>
          </div>
          <Bot className="size-5 text-white/30" />
        </div>

        <div className="relative flex items-center justify-center mb-8">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-24 rounded-full border border-white/[4%] animate-spin-slow" />
            <div className="size-36 rounded-full border border-white/[2%] animate-spin-slower-reverse" />
          </div>
          <div className="relative size-16 rounded-full bg-white/[4%] flex items-center justify-center ring-1 ring-white/[8%]">
            <CreditCard className="size-7 text-white/60" />
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className={`px-3 py-1.5 rounded-lg ${agent.bg} ring-1 ring-white/[4%] text-xs text-white/60 font-medium`}
            >
              {agent.name}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-white/[4%] text-center">
          <span className="text-xs text-white/20">
            Plug into any MCP-compatible runtime
          </span>
        </div>
      </div>

      <div className="absolute -bottom-3 -right-3 w-full h-full rounded-2xl border border-white/[3%] -z-10" />
      <div className="absolute -bottom-6 -right-6 w-full h-full rounded-2xl border border-white/[2%] -z-20" />
    </div>
  );
}

function IntegrationsSection() {
  return (
    <section className="relative py-24 sm:py-32 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16 animate-fade-in-up">
          <Badge
            variant="outline"
            className="rounded-full border-white/[6%] bg-white/[2%] text-white/50 px-4 py-1 text-xs font-medium tracking-wide mb-6"
          >
            Integrations
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-white">
            What can your agent do?
          </h2>
          <p className="mt-4 text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
            One integration for every payment method. Your agent can order from these
            services using pay2 Cash.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <IntegrationCardActive />
          <IntegrationCardCiCi />
          <IntegrationCardFlights />
          <IntegrationCardONDC />
          <IntegrationCardComingSoon
            name="Uber Eats"
            description="Order food delivery from the Uber Eats marketplace"
            icon={
              <svg className="size-5 text-white/20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
              </svg>
            }
          />
          <IntegrationCardComingSoon
            name="Domino's Pizza"
            description="Order pizza and track delivery in real-time"
            icon={
              <svg className="size-5 text-white/20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" fill="black" />
              </svg>
            }
          />
          <IntegrationCardComingSoon
            name="Zomato"
            description="Discover restaurants and order food delivery"
            icon={
              <svg className="size-5 text-white/20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M8 12h8M12 8v8" stroke="black" strokeWidth="2" />
              </svg>
            }
          />
          <IntegrationCardComingSoon
            name="Blinkit"
            description="Instant delivery of groceries and essentials"
            icon={
              <svg className="size-5 text-white/20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
            }
          />
          <IntegrationCardComingSoon
            name="More Coming Soon"
            description="We are building more integrations every week"
            icon={
              <svg className="size-5 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            }
          />
        </div>
      </div>
    </section>
  );
}

function IntegrationCardActive() {
  return (
    <div className="relative group md:col-span-2 lg:col-span-1">
      <div className="rounded-2xl border border-white/[6%] bg-gradient-to-br from-white/[2%] via-white/[1%] to-transparent p-6 backdrop-blur-sm transition-all duration-500 hover:border-white/[10%] hover:bg-white/[3%] h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
              <svg className="size-5 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-lg">Swiggy</span>
                <span className="px-2 py-0.5 rounded-full bg-white/[6%] text-[10px] text-white/70 font-medium uppercase tracking-[0.06em]">
                  Available
                </span>
              </div>
              <p className="text-xs text-white/30">Powered by Swiggy Builders Club</p>
            </div>
          </div>
          <div className="size-2 rounded-full bg-white/30 animate-pulse" />
        </div>

        <p className="text-sm text-white/50 leading-relaxed mb-5">
          Discover restaurants, explore menus, order food delivery, get groceries from
          Instamart, and book tables via Dineout — all through your AI agent.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {["Food Delivery", "Instamart", "Dineout"].map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-lg bg-white/[3%] ring-1 ring-white/[4%] text-[11px] text-white/40 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/30">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          35+ API tools
        </div>
      </div>
    </div>
  );
}

function IntegrationCardCiCi() {
  return (
    <div className="relative group">
      <div className="rounded-2xl border border-white/[6%] bg-gradient-to-br from-white/[2%] via-white/[1%] to-transparent p-6 backdrop-blur-sm transition-all duration-500 hover:border-white/[10%] hover:bg-white/[3%] h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
              <svg className="size-5 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10a2 2 0 002 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-lg">CiCi Label</span>
                <span className="px-2 py-0.5 rounded-full bg-white/[6%] text-[10px] text-white/70 font-medium uppercase tracking-[0.06em]">
                  Available
                </span>
              </div>
              <p className="text-xs text-white/30">cicilabel.com</p>
            </div>
          </div>
          <div className="size-2 rounded-full bg-white/30 animate-pulse" />
        </div>

        <p className="text-sm text-white/50 leading-relaxed mb-5">
          Browse the fashion label, build a look, and check out — your agent pays with
          pay2 Cash and the payment settles straight to the brand.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {["Fashion", "Apparel", "Split Settlement"].map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-lg bg-white/[3%] ring-1 ring-white/[4%] text-[11px] text-white/40 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/30">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Pay via UPI or card
        </div>
      </div>
    </div>
  );
}

function IntegrationCardFlights() {
  return (
    <Link href="/fly" className="relative group block">
      <div className="rounded-2xl border border-white/[6%] bg-gradient-to-br from-white/[2%] via-white/[1%] to-transparent p-6 backdrop-blur-sm transition-all duration-500 hover:border-white/[10%] hover:bg-white/[3%] h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
              <Plane className="size-5 text-white/70" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-lg">Flights</span>
                <span className="px-2 py-0.5 rounded-full bg-white/[6%] text-[10px] text-white/70 font-medium uppercase tracking-[0.06em]">
                  Available
                </span>
              </div>
              <p className="text-xs text-white/30">Book flights across Europe</p>
            </div>
          </div>
          <div className="size-2 rounded-full bg-white/30 animate-pulse" />
        </div>

        <p className="text-sm text-white/50 leading-relaxed mb-5">
          Tell your agent where and when. It finds a fare, pays with a single-use virtual
          card capped at the ticket price, and the card self-destructs after booking.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {["Flights", "Single-use card", "EUR"].map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-lg bg-white/[3%] ring-1 ring-white/[4%] text-[11px] text-white/40 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/30 group-hover:text-white/50 transition-colors">
          See how it works
          <ArrowRight className="size-3.5" />
        </div>
      </div>
    </Link>
  );
}

function IntegrationCardONDC() {
  return (
    <div className="relative group">
      <div className="rounded-2xl border border-white/[6%] bg-gradient-to-br from-white/[2%] via-white/[1%] to-transparent p-6 backdrop-blur-sm transition-all duration-500 hover:border-white/[10%] hover:bg-white/[3%] h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
              <svg className="size-5 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="5" r="2.5" />
                <circle cx="5" cy="18" r="2.5" />
                <circle cx="19" cy="18" r="2.5" />
                <path d="M12 7.5v3.5M10.2 12.8l-3.4 3M13.8 12.8l3.4 3" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-lg">ONDC Network</span>
                <span className="px-2 py-0.5 rounded-full bg-white/[6%] text-[10px] text-white/70 font-medium uppercase tracking-[0.06em]">
                  Pre-Prod
                </span>
              </div>
              <p className="text-xs text-white/30">Open network for digital commerce</p>
            </div>
          </div>
          <div className="size-2 rounded-full bg-white/30 animate-pulse" />
        </div>

        <p className="text-sm text-white/50 leading-relaxed mb-5">
          One open-protocol connection lets your agent shop the entire ONDC network —
          groceries, food, retail and more from thousands of sellers across India — and
          pay over UPI. No per-merchant deals: a single Beckn integration reaches the
          whole network, with cancellations, returns and grievances handled end-to-end.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {["Grocery", "Open Network", "UPI"].map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-lg bg-white/[3%] ring-1 ring-white/[4%] text-[11px] text-white/40 font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/30">
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Live buyer app on ONDC pre-prod
        </div>
      </div>
    </div>
  );
}

function IntegrationCardComingSoon({
  name,
  description,
  icon,
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative group">
      <div className="rounded-2xl border border-white/[4%] bg-white/[1%] p-6 backdrop-blur-sm transition-all duration-300 h-full opacity-50 hover:opacity-70">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-xl bg-white/[3%] flex items-center justify-center ring-1 ring-white/[4%]">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white/40 font-semibold text-sm">{name}</span>
            </div>
            <span className="text-[10px] text-white/20 uppercase tracking-[0.06em]">
              Coming Soon
            </span>
          </div>
        </div>
        <p className="text-xs text-white/30 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

