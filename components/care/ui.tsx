"use client";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/engine";

/** Plain names for the four response bands. Colour, shape and word always travel together. */
export const TIERS: Record<Tier, { label: string; glyph: string; txt: string; bg: string; edge: string; solid: string }> = {
  stable: { label: "Stable", glyph: "●", txt: "text-care-ok", bg: "bg-care-tint", edge: "border-care-ok", solid: "bg-care-ok" },
  watch: { label: "Watch", glyph: "▲", txt: "text-care-warn", bg: "bg-care-warnBg", edge: "border-care-warn", solid: "bg-care-warn" },
  elevated: { label: "Urgent", glyph: "◆", txt: "text-care-hot", bg: "bg-care-hotBg", edge: "border-care-hot", solid: "bg-care-hot" },
  critical: { label: "Emergency", glyph: "■", txt: "text-care-crit", bg: "bg-care-critBg", edge: "border-care-crit", solid: "bg-care-crit" },
};

export function Chip({ tier, text, className }: { tier: Tier; text?: string; className?: string }) {
  const t = TIERS[tier];
  return <span className={cn("rd inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-semibold", t.bg, t.txt, className)}><span aria-hidden className="text-xs">{t.glyph}</span>{text ?? t.label}</span>;
}

export function Btn({ kind = "ghost", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "ghost" }) {
  return <button {...p} className={cn("rd min-h-11 px-5 text-[15px] font-semibold transition-colors disabled:opacity-40",
    kind === "primary" ? "bg-care-brand text-care-onBrand hover:bg-care-brandHover" : "border border-care-brand text-care-brand hover:bg-care-tint", className)} />;
}

/** Same shape as the notice on the real sites I looked at: tinted ground, thick leading edge, heading, consequence, next step. */
export function Notice({ tier, title, children, action }: { tier: Tier; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const t = TIERS[tier];
  return (
    <div className={cn("border-l-4", t.bg, t.edge)}>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-8 gap-y-4 px-6 py-5 md:px-10">
        <div className="min-w-0 max-w-3xl"><p className={cn("text-lg font-semibold", t.txt)}><span aria-hidden className="mr-2 text-sm">{t.glyph}</span>{title}</p>{children && <p className="mt-1 text-[15px] leading-7 text-care-text">{children}</p>}</div>
        {action}
      </div>
    </div>
  );
}
