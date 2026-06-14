"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import type { NegotiationStrategy, StrategyOption } from "@/lib/types";

interface Props {
  options: StrategyOption[];
  onChoose: (strategy: NegotiationStrategy) => void;
}

const STRATEGY_STYLES: Record<NegotiationStrategy, { accent: string; badge: string; bar: string }> = {
  aggressive: {
    accent: "border-red-300 hover:border-red-400 hover:bg-red-50",
    badge: "bg-red-100 text-red-700",
    bar: "bg-gradient-to-r from-red-400 via-red-500 to-red-400",
  },
  medium: {
    accent: "border-accent/40 hover:border-accent hover:bg-accent/5",
    badge: "bg-accent/10 text-accent",
    bar: "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400",
  },
  light: {
    accent: "border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50",
    badge: "bg-emerald-100 text-emerald-700",
    bar: "bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400",
  },
};

const ROUND_GLYPHS: Record<NegotiationStrategy, string> = {
  aggressive: "●●●●●",
  medium: "●●●",
  light: "●●",
};

export function StrategyModal({ options, onChoose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const backdrop = backdropRef.current;
    const card = cardRef.current;
    if (!backdrop || !card) return;
    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" });
    gsap.fromTo(
      card,
      { opacity: 0, y: 12, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "power3.out" },
    );
  }, []);

  const handleChoose = (strategy: NegotiationStrategy) => {
    const backdrop = backdropRef.current;
    const card = cardRef.current;
    if (!backdrop || !card) { onChoose(strategy); return; }
    gsap.to(card, { opacity: 0, scale: 0.97, y: -4, duration: 0.16, ease: "power2.in" });
    gsap.to(backdrop, {
      opacity: 0,
      duration: 0.2,
      ease: "power2.in",
      onComplete: () => onChoose(strategy),
    });
  };

  return (
    <div
      ref={backdropRef}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]"
    >
      <div
        ref={cardRef}
        className="mx-4 w-full max-w-[520px] overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow-md)]"
      >
        {/* Accent bar */}
        <div className="h-1 bg-gradient-to-r from-accent/60 via-accent to-accent/60" />

        {/* Header */}
        <div className="px-6 pb-2 pt-5">
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Negotiation Strategy
          </div>
          <h3 className="text-[16px] font-semibold leading-snug text-text-1">
            How aggressively should the agent negotiate?
          </h3>
          <p className="mt-1 text-[12.5px] text-text-3">
            Sellers reject offers below 10% off their listed price.
          </p>
        </div>

        {/* Strategy cards */}
        <div className="flex flex-col gap-2.5 px-6 py-4">
          {options.map((opt) => {
            const styles = STRATEGY_STYLES[opt.id] ?? STRATEGY_STYLES.medium;
            return (
              <button
                key={opt.id}
                onClick={() => handleChoose(opt.id)}
                className={`group flex w-full items-start gap-4 rounded-xl border bg-white px-4 py-3.5 text-left transition-all active:scale-[0.985] ${styles.accent}`}
              >
                {/* Strategy glyph */}
                <div className="mt-0.5 shrink-0">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest ${styles.badge}`}>
                    {ROUND_GLYPHS[opt.id]}
                  </span>
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13.5px] font-semibold text-text-1">{opt.label}</span>
                    <span className="text-[11px] text-text-3">up to {opt.max_rounds} rounds</span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-text-2">{opt.description}</p>
                </div>

                {/* Arrow */}
                <span className="mt-1 shrink-0 text-[14px] text-text-3 opacity-0 transition-opacity group-hover:opacity-100">
                  →
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border px-6 py-3">
          <p className="text-[11px] text-text-3">
            Selection pauses the agent feed. Stream resumes immediately after you choose.
          </p>
        </div>
      </div>
    </div>
  );
}
