"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Link2, Mail } from "lucide-react";

const ONBOARD_EMAIL = "hello@pay2.cash";

export function OnboardingForm() {
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [links, setLinks] = useState("");
  const [sells, setSells] = useState("");
  const [sent, setSent] = useState(false);

  const valid = brand.trim() && email.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const subject = `pay2 Cash onboarding — ${brand.trim()}`;
    const body = [
      `Brand / store: ${brand.trim()}`,
      `Contact: ${name.trim() || "—"}`,
      `Email: ${email.trim()}`,
      `What we sell: ${sells.trim() || "—"}`,
      ``,
      `Links to our project / store / socials:`,
      links.trim() || "(none provided yet)",
    ].join("\n");
    // Open the user's mail client with a pre-filled application.
    window.location.href = `mailto:${ONBOARD_EMAIL}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };

  if (sent) {
    // The "onboarding email" — what we send back once a brand applies.
    return (
      <div className="relative max-w-xl mx-auto text-left rounded-2xl border border-white/[10%] bg-gradient-to-br from-white/[3%] via-white/[2%] to-transparent p-7 sm:p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="size-10 rounded-xl bg-white/[5%] flex items-center justify-center ring-1 ring-white/[8%]">
            <Mail className="size-5 text-white/70" />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Application received</p>
            <p className="text-xs text-white/30">
              from pay2 Cash · to {email.trim() || "you"}
            </p>
          </div>
        </div>

        <div className="space-y-4 text-sm text-white/55 leading-relaxed">
          <p>
            Thanks{name.trim() ? `, ${name.trim().split(" ")[0]}` : ""} — we&apos;ve
            got your application for{" "}
            <span className="text-white/80 font-medium">{brand.trim()}</span>.
          </p>
          <p>
            <span className="text-white/80 font-medium">
              Drop us links to your project
            </span>{" "}
            — your store, catalog, app, or socials — so we can take a proper look at
            what you sell and how you sell it.
          </p>
          <p>
            One heads-up: to make your catalog shoppable by AI agents, we may need to{" "}
            <span className="text-white/80 font-medium">
              work out an MCP wrapper around your existing services
            </span>{" "}
            (your storefront, catalog, or order APIs). We&apos;ll figure out the
            cleanest way to plug you in and walk you through it.
          </p>
          <p className="text-white/40">
            We&apos;ll be in touch shortly. You can always reach us at{" "}
            <a
              href={`mailto:${ONBOARD_EMAIL}`}
              className="text-white/70 hover:text-white transition-colors"
            >
              {ONBOARD_EMAIL}
            </a>
            .
          </p>
        </div>

        <div className="mt-6 flex items-center gap-2 text-xs text-emerald-400/80">
          <Check className="size-4" />
          Your mail app should have opened with the application pre-filled.
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="relative max-w-xl mx-auto text-left rounded-2xl border border-white/[10%] bg-gradient-to-br from-white/[3%] via-white/[2%] to-transparent p-7 sm:p-8 space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Brand / store name" required>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="CiCi Label"
            className={inputCls}
          />
        </Field>
        <Field label="Your name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Email" required>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@brand.com"
          className={inputCls}
        />
      </Field>

      <Field label="Links to your project / store / socials">
        <div className="relative">
          <Link2 className="absolute left-3 top-3 size-4 text-white/25" />
          <textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            rows={3}
            placeholder="https://yourstore.com&#10;https://instagram.com/yourbrand"
            className={`${inputCls} pl-9 resize-none`}
          />
        </div>
      </Field>

      <Field label="What do you sell?">
        <input
          value={sells}
          onChange={(e) => setSells(e.target.value)}
          placeholder="Fashion, apparel, local goods…"
          className={inputCls}
        />
      </Field>

      <Button
        type="submit"
        disabled={!valid}
        className="w-full h-12 rounded-full bg-white text-black hover:bg-white/90 font-medium gap-2 disabled:opacity-40 disabled:pointer-events-none"
      >
        Apply to onboard
        <ArrowRight className="size-4" />
      </Button>
      <p className="text-center text-xs text-white/30">
        No new payments licence needed. Paid out in INR (₹) or EUR (€).
      </p>
    </form>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/[8%] bg-white/[3%] px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-white/[18%] focus:bg-white/[5%]";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-white/45">
        {label}
        {required && <span className="text-white/25"> *</span>}
      </span>
      {children}
    </label>
  );
}
