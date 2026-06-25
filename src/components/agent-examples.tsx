"use client";

import { useEffect, useState } from "react";
import { Smartphone, Network } from "lucide-react";

export type AgentExample = {
  tag: string;
  user: string;
  agent: string;
};

// Bold any ₹-amount inside the agent's reply so prices pop, like the static cards.
function withPrices(text: string) {
  const parts = text.split(/(₹[\d,]+)/g);
  return parts.map((p, i) =>
    /^₹[\d,]+$/.test(p) ? (
      <span key={i} className="font-medium text-white">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export function AgentExamples({
  examples,
  interval = 3800,
}: {
  examples: AgentExample[];
  interval?: number;
}) {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setShow(false);
      const t = setTimeout(() => {
        setI((p) => (p + 1) % examples.length);
        setShow(true);
      }, 280);
      return () => clearTimeout(t);
    }, interval);
    return () => clearInterval(id);
  }, [examples.length, interval]);

  const ex = examples[i];

  return (
    <div className="rounded-2xl border border-white/[6%] bg-white/[2%] p-6 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-full bg-white/[4%] flex items-center justify-center ring-1 ring-white/[6%]">
            <Smartphone className="size-4 text-white/60" />
          </div>
          <div>
            <p className="text-xs text-white/50 font-medium">Assistant</p>
            <p className="text-[10px] text-white/30 font-mono">online</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[8%] bg-white/[3%] px-2.5 py-1 text-[10px] font-medium text-white/50">
          <Network className="size-3 text-white/40" />
          via ONDC
        </span>
      </div>

      <div
        className={`flex flex-col gap-4 flex-1 justify-end min-h-[168px] transition-opacity duration-300 ${
          show ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex justify-start">
          <span className="px-2.5 py-1 rounded-lg bg-white/[3%] ring-1 ring-white/[4%] text-[11px] text-white/45 font-medium">
            {ex.tag}
          </span>
        </div>

        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white text-black px-4 py-2.5 text-sm leading-relaxed">
            {ex.user}
          </div>
        </div>

        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white/[4%] ring-1 ring-white/[6%] text-white/80 px-4 py-2.5 text-sm leading-relaxed">
            {withPrices(ex.agent)}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-1.5">
        {examples.map((_, idx) => (
          <button
            key={idx}
            type="button"
            aria-label={`Example ${idx + 1}`}
            onClick={() => {
              setShow(false);
              setTimeout(() => {
                setI(idx);
                setShow(true);
              }, 120);
            }}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === i ? "w-5 bg-white/60" : "w-1.5 bg-white/15 hover:bg-white/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
