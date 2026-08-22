"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "default" | "highContrastLight";

type ThemeContextValue = {
  theme: ThemeMode;
  isHighContrast: boolean;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
};

const STORAGE_KEY = "a11y-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("default");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme = savedTheme === "highContrastLight" ? "highContrastLight" : "default";
    setThemeState(nextTheme);
  }, []);

  useEffect(() => {
    if (theme === "highContrastLight") {
      document.documentElement.dataset.theme = "highContrastLight";
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    document.documentElement.style.colorScheme = "light";
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isHighContrast: theme === "highContrastLight",
      setTheme: (nextTheme) => setThemeState(nextTheme),
      toggleTheme: () =>
        setThemeState((currentTheme) =>
          currentTheme === "highContrastLight" ? "default" : "highContrastLight",
        ),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }

  return context;
}
