import Link from "next/link";
import { Button } from "@/components/ui/button";

const NAV = [
  { label: "Personal", href: "/personal" },
  { label: "Companies", href: "/companies" },
  { label: "Merchant", href: "/merchant" },
  { label: "Updates", href: "/updates" },
  { label: "About", href: "/about" },
];

export function SiteNav({ current }: { current?: string }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16 bg-black/80 backdrop-blur-xl border-b border-white/[3%]">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="size-8 rounded-xl bg-white flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
            <span className="text-black font-bold text-sm tracking-tight">P2</span>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">pay2 Cash</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`text-sm transition-all duration-200 ${
                current === item.href ? "text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <a
          href="/agent.txt"
          className="hidden sm:block text-sm text-white/40 hover:text-white transition-all duration-200"
        >
          Are you an agent?
        </a>
        <Button
          variant="outline"
          className="hidden sm:inline-flex h-10 rounded-full border-white/[8%] text-white/70 bg-transparent hover:bg-white/[4%] hover:text-white transition-all duration-200"
        >
          Schedule a call
        </Button>
        <Link href="/get-started">
          <Button className="h-10 rounded-full bg-white text-black hover:bg-white/90 font-medium transition-all duration-200">
            Get Started
          </Button>
        </Link>
      </div>
    </header>
  );
}
