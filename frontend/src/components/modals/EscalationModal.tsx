"use client";

import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import { Warning, CheckCircle, XCircle, ArrowsCounterClockwise, MagnifyingGlass } from "@phosphor-icons/react";
import type { EscalationResult } from "@/lib/types";

interface Props {
  data: EscalationResult;
  onDecide: (d: "approved" | "rejected" | "renegotiate" | "restart", note?: string) => void;
}

export function EscalationModal({ data, onDecide }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");

  const noOffer = data.trigger === "no_compatible_offer";
  const canRenegotiate = !noOffer && !data.renegotiate_used && data.has_winning_offer !== false;

  // Entry: backdrop fades, card slides up
  useEffect(() => {
    const backdrop = backdropRef.current;
    const card = cardRef.current;
    if (!backdrop || !card) return;

    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" });
    gsap.fromTo(
      card,
      { opacity: 0, y: 8, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: "power3.out" },
    );
  }, []);

  const handleDecide = (d: "approved" | "rejected" | "renegotiate" | "restart", renegotiateNote?: string) => {
    const backdrop = backdropRef.current;
    const card = cardRef.current;
    if (!backdrop || !card) { onDecide(d, renegotiateNote); return; }

    gsap.to(card, { opacity: 0, scale: 0.97, y: -4, duration: 0.16, ease: "power2.in" });
    gsap.to(backdrop, {
      opacity: 0,
      duration: 0.2,
      ease: "power2.in",
      onComplete: () => onDecide(d, renegotiateNote),
    });
  };

  if (noOffer) {
    return (
      <div
        ref={backdropRef}
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]"
      >
        <div
          ref={cardRef}
          className="mx-4 w-full max-w-[360px] overflow-hidden rounded-2xl border border-border bg-white px-8 py-8 text-center shadow-[var(--shadow-md)]"
        >
          <p className="text-[16px] font-semibold text-text-1">No match found</p>
          <p className="mt-1.5 text-[13px] text-text-3">No supplier could meet your requirements.</p>
          <button
            onClick={() => handleDecide("restart")}
            className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-95 active:scale-[0.97]"
          >
            <MagnifyingGlass weight="bold" className="h-4 w-4" />
            New Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={backdropRef}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]"
    >
      <div
        ref={cardRef}
        className="mx-4 w-full max-w-[480px] overflow-hidden rounded-2xl border border-border bg-white shadow-[var(--shadow-md)]"
      >
        {/* Amber accent bar */}
        <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />

        {/* Header */}
        <div className="flex items-start gap-4 px-6 pb-4 pt-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-warning">
            <Warning weight="fill" className="h-5 w-5" />
          </span>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
              Human Escalation Required
            </div>
            <h3 className="text-[16px] font-semibold leading-snug text-text-1">
              {data.reason}
            </h3>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 pb-5">
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">
              Question
            </div>
            <p className="text-[13.5px] leading-relaxed text-text-2">
              {data.question_for_human}
            </p>
          </div>
          {data.trigger && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-warning">
              Trigger · {data.trigger}
            </span>
          )}

          {/* Note input — revealed when user clicks Negotiate Again */}
          {showNoteInput && (
            <div className="mt-4">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-text-3">
                Your adjustment
              </label>
              <textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. I can go up to €700 now, but need delivery in 3 days."
                rows={3}
                className="w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-text-1 placeholder:text-text-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-border px-6 py-4">
          {showNoteInput ? (
            <>
              <button
                onClick={() => { setShowNoteInput(false); setNote(""); }}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-[13px] font-semibold text-text-2 transition-all hover:bg-surface-2 active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDecide("renegotiate", note.trim())}
                disabled={!note.trim()}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-95 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowsCounterClockwise weight="bold" className="h-4 w-4" />
                Send &amp; Re-negotiate
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleDecide("rejected")}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-[13px] font-semibold text-danger transition-all hover:bg-danger-soft active:scale-[0.97]"
              >
                <XCircle weight="bold" className="h-4 w-4" />
                Reject
              </button>
              {canRenegotiate && (
                <button
                  onClick={() => setShowNoteInput(true)}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-[13px] font-semibold text-text-2 transition-all hover:border-accent hover:text-accent active:scale-[0.97]"
                >
                  <ArrowsCounterClockwise weight="bold" className="h-4 w-4" />
                  Negotiate Again
                </button>
              )}
              <button
                onClick={() => handleDecide("approved")}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-95 active:scale-[0.97]"
              >
                <CheckCircle weight="bold" className="h-4 w-4" />
                Approve Deal
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
