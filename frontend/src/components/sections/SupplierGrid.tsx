"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MapPin, ChartBar, Handshake, CheckCircle, XCircle, CaretDown } from "@phosphor-icons/react";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import type { MatchedSupplier, ValidationResult } from "@/lib/types";
import { displayName } from "@/lib/api";

interface Props {
  suppliers: MatchedSupplier[];
  validationResults?: ValidationResult[];
}

export function SupplierGrid({ suppliers, validationResults = [] }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-tinted)]">
      <SectionHeader
        letter="D"
        title="Matched suppliers"
        subtitle="ranked by Supplier Matching Agent"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(185px,1fr))]">
        {suppliers.map((s, i) => {
          const validation = validationResults.find((v) => v.seller_id === s.seller_id) ?? null;
          return (
            <SupplierCard key={s.seller_id} supplier={s} best={i === 0} validation={validation} />
          );
        })}
      </div>
    </div>
  );
}

function SupplierCard({
  supplier,
  best,
  validation,
}: {
  supplier: MatchedSupplier;
  best: boolean;
  validation: ValidationResult | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={`flex flex-col rounded-xl transition-all duration-200 ${
        best
          ? "bg-gradient-to-b from-accent-soft/70 to-white ring-1 ring-accent-border shadow-[0_1px_2px_rgb(37_99_235_/_0.08),0_12px_28px_-12px_rgb(37_99_235_/_0.22)]"
          : "bg-surface ring-1 ring-border hover:ring-border-strong"
      }`}
    >
      <div className="flex flex-col p-4">
        {best && (
          <span className="mb-2.5 inline-flex w-fit items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_2px_8px_rgb(79_70_229_/_0.28)]">
            Best match
          </span>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-2 font-mono text-[10.5px] font-semibold text-text-2">
              α
            </span>
            <span className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-text-1">
              {displayName(supplier.seller_name)}
            </span>
          </div>
          <span className="shrink-0 font-mono text-[14px] font-semibold tabular-nums text-accent">
            {supplier.match_score.toFixed(2)}
          </span>
        </div>

        <div className="mt-2.5 text-[11.5px] leading-snug text-text-2 [text-wrap:balance]">
          {supplier.specialization}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-text-2">
          <Row icon={<MapPin className="h-3 w-3" />} value={supplier.region ?? "—"} />
          <Row
            icon={<ChartBar className="h-3 w-3" />}
            value={`reliability ${(supplier.reliability_score ?? 0).toFixed(2)}`}
          />
          <Row
            icon={<Handshake className="h-3 w-3" />}
            value={supplier.negotiation_style ?? "—"}
          />
        </div>

        <div className="mt-auto pt-3 text-[11px] leading-snug text-text-3 [text-wrap:pretty]">
          {supplier.reason}
        </div>

        {validation && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 flex items-center justify-between rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[11px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1"
          >
            <span className="flex items-center gap-1.5">
              {validation.status === "passed" ? (
                <CheckCircle className="h-3.5 w-3.5 text-success" weight="fill" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-danger" weight="fill" />
              )}
              <span className="uppercase tracking-wide">{validation.status}</span>
              <span className="text-text-3">· score {validation.score}</span>
            </span>
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
              <CaretDown className="h-3 w-3" />
            </motion.span>
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && validation && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <ValidationBreakdown validation={validation} />
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function ValidationBreakdown({ validation }: { validation: ValidationResult }) {
  const constraints = [
    { label: "Price", value: `€${validation.price_eur}`, key: "price" },
    { label: "Delivery", value: `${validation.delivery_days}d`, key: "delivery" },
    { label: "Warranty", value: `${validation.warranty_years}yr`, key: "warranty" },
    ...(validation.length_mm ? [{ label: "Length", value: `${validation.length_mm}mm`, key: "length" }] : []),
    ...(validation.power_watts ? [{ label: "Power", value: `${validation.power_watts}W`, key: "power" }] : []),
  ];

  const failedSet = new Set(
    (validation.failed_constraints ?? []).map((s) => s.toLowerCase()),
  );

  return (
    <div className="border-t border-border px-4 pb-4 pt-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-3">
        Constraint breakdown
      </p>
      <ul className="flex flex-col gap-1.5">
        {constraints.map((c) => {
          const failed = [...failedSet].some((f) => f.includes(c.key));
          return (
            <li key={c.key} className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-text-2">
                {failed ? (
                  <XCircle className="h-3 w-3 text-danger" weight="fill" />
                ) : (
                  <CheckCircle className="h-3 w-3 text-success" weight="fill" />
                )}
                {c.label}
              </span>
              <span className={`font-mono font-medium ${failed ? "text-danger" : "text-text-1"}`}>
                {c.value}
              </span>
            </li>
          );
        })}
      </ul>
      {validation.failed_constraints?.length > 0 && (
        <div className="mt-2.5 rounded-lg bg-danger-soft px-3 py-2 text-[10.5px] leading-snug text-danger">
          {validation.failed_constraints.join(" · ")}
        </div>
      )}
    </div>
  );
}

function Row({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-1.5 tabular-nums">
      <span className="text-text-3">{icon}</span>
      <span>{value}</span>
    </div>
  );
}
