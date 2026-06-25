import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[3%] py-8 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="size-6 rounded-lg bg-white flex items-center justify-center">
            <span className="text-black font-bold text-[10px]">P2</span>
          </div>
          <span className="text-sm text-white/30">pay2 Cash</span>
        </div>
        <div className="flex items-center gap-5 text-xs text-white/30">
          <Link href="/personal" className="hover:text-white/60 transition-colors">Personal</Link>
          <Link href="/companies" className="hover:text-white/60 transition-colors">Companies</Link>
          <Link href="/merchant" className="hover:text-white/60 transition-colors">Merchant</Link>
          <a href="/agent.txt" className="hover:text-white/60 transition-colors">agent.txt</a>
        </div>
        <p className="text-xs text-white/20">
          &copy; {new Date().getFullYear()} pay2 Cash. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
