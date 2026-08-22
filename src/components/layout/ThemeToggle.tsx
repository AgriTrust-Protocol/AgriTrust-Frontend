"use client";

import { useTheme } from "@/src/components/providers/ThemeProvider";

export function ThemeToggle() {
  const { isHighContrast, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label={
        isHighContrast ? "Switch to default light mode" : "Toggle high contrast mode"
      }
      aria-pressed={isHighContrast}
      title={
        isHighContrast ? "Switch to default light mode" : "Toggle high contrast mode"
      }
      onClick={toggleTheme}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-300 bg-white text-lg font-bold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-100 focus-visible:outline-none"
    >
      <span aria-hidden="true">☀</span>
    </button>
  );
}
