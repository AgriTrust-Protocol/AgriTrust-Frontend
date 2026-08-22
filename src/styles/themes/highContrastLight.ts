export interface Theme {
  background: string;
  foreground: string;
  muted: string;
  surface: string;
  border: string;
  primary: string;
  primaryForeground: string;
  success: string;
  warning: string;
  danger: string;
  link: string;
  focusRing: string;
}

export const highContrastLightTheme: Theme = {
  background: "#FFFFFF",
  foreground: "#000000",
  muted: "#111111",
  surface: "#F7F7F7",
  border: "#BDBDBD",
  primary: "#0050B3",
  primaryForeground: "#FFFFFF",
  success: "#1A7D36",
  warning: "#B8860B",
  danger: "#B30000",
  link: "#0033CC",
  focusRing: "#0033CC",
};
