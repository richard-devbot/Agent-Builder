"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // false during SSR and hydration, true afterwards — avoids a mismatched label.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const next = resolvedTheme === "dark" ? "light" : "dark";
  const label = mounted ? `Switch to ${next} mode` : "Toggle theme";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Sun
        aria-hidden
        className="h-4 w-4 rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0"
      />
      <Moon
        aria-hidden
        className="absolute inset-0 m-auto h-4 w-4 rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100"
      />
      <span className="sr-only">{label}</span>
    </Button>
  );
}
