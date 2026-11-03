/** Illustrations and copy for the three project types. Pure SVG + icons, themed via `--t`. */

import { Archive, ArrowRight, Blocks, Building2, Cloud, Sprout, Sparkles, Wrench } from "lucide-react";
import type { ProjectType } from "@/lib/kit/project-types";

export const TYPE_META: Record<
  ProjectType,
  { accent: string; tagline: string; bestFor: string[]; adds: { playbook: string; rule: string } }
> = {
  greenfield: {
    accent: "#10b981",
    tagline: "Build something new",
    bestFor: ["New products and internal tools", "Start from an idea, requirements or designs"],
    adds: { playbook: "Greenfield starter playbook", rule: "Requirements-first operating rule" },
  },
  brownfield: {
    accent: "#f59e0b",
    tagline: "Improve what exists",
    bestFor: ["Features, refactors and upgrades", "Agent maps the codebase before it changes it"],
    adds: { playbook: "Brownfield onboarding playbook", rule: "Discovery-before-change rule" },
  },
  "legacy-migration": {
    accent: "#8b5cf6",
    tagline: "Move off an old platform",
    bestFor: ["Mainframe, .NET Framework, Java EE, VB6", "Inventory, plan, then migrate in phases"],
    adds: { playbook: "Legacy migration playbook", rule: "Behaviour-parity migration rule" },
  },
};

/** Layered icon composition per type: a large glyph, orbiting accents, and a soft glow. */
export function TypeArt({ type, active }: { type: ProjectType; active: boolean }) {
  return (
    <div className="relative h-36 overflow-hidden bg-[radial-gradient(120%_120%_at_20%_0%,color-mix(in_oklch,var(--t)_30%,transparent),transparent_65%)]">
      <div aria-hidden className="bg-grid absolute inset-0 opacity-60" />
      <svg aria-hidden viewBox="0 0 320 144" className="absolute inset-0 size-full">
        <circle cx="250" cy="40" r="58" className="fill-[var(--t)] opacity-[0.07]" />
        <circle cx="250" cy="40" r="34" className="fill-[var(--t)] opacity-[0.08]" />
        <path d="M0 120 C 80 96, 160 136, 320 104" fill="none" strokeWidth="1.5" strokeDasharray="4 6" className="stroke-[var(--t)] opacity-40" />
      </svg>
      {type === "greenfield" && (
        <>
          <Glyph className="top-6 left-6" icon={Sprout} big active={active} />
          <Float className="top-7 right-16 [animation-delay:0ms]" icon={Sparkles} />
          <Float className="right-8 bottom-6 [animation-delay:600ms]" icon={Blocks} />
        </>
      )}
      {type === "brownfield" && (
        <>
          <Glyph className="top-6 left-6" icon={Building2} big active={active} />
          <Float className="top-7 right-16 [animation-delay:200ms]" icon={Wrench} />
          <Float className="right-8 bottom-6 [animation-delay:800ms]" icon={Blocks} />
        </>
      )}
      {type === "legacy-migration" && (
        <>
          <Glyph className="top-8 left-6" icon={Archive} active={active} muted />
          <ArrowRight aria-hidden className="absolute top-14 left-24 size-6 text-[var(--t)] transition-transform duration-500 group-hover:translate-x-1.5" />
          <Glyph className="top-6 left-36" icon={Cloud} big active={active} />
          <Float className="right-8 bottom-6 [animation-delay:400ms]" icon={Blocks} />
        </>
      )}
    </div>
  );
}

function Glyph({
  icon: Icon,
  className,
  big,
  muted,
  active,
}: {
  icon: typeof Sprout;
  className: string;
  big?: boolean;
  muted?: boolean;
  active: boolean;
}) {
  return (
    <span
      className={`absolute flex items-center justify-center rounded-2xl border shadow-lg transition-transform duration-500 group-hover:-translate-y-1 ${className} ${
        big ? "size-16" : "size-12"
      } ${
        muted
          ? "border-border bg-muted text-muted-foreground"
          : "border-white/10 bg-[color-mix(in_oklch,var(--t)_85%,black)] text-white shadow-[color-mix(in_oklch,var(--t)_40%,transparent)]"
      } ${active ? "group-hover:rotate-0" : "group-hover:-rotate-6"}`}
    >
      <Icon className={big ? "size-7" : "size-5"} />
    </span>
  );
}

function Float({ icon: Icon, className }: { icon: typeof Sprout; className: string }) {
  return (
    <span className={`absolute flex size-8 animate-bounce items-center justify-center rounded-xl border bg-card/90 text-[var(--t)] shadow-sm [animation-duration:3s] ${className}`}>
      <Icon className="size-4" />
    </span>
  );
}
