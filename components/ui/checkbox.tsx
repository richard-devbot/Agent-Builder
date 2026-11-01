"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-input bg-background shadow-xs outline-none transition-[background-color,border-color,box-shadow] duration-150",
        "hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/40",
        "data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex animate-check items-center justify-center"
      >
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
