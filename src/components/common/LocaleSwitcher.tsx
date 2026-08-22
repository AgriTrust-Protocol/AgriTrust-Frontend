"use client";

import { useLocale } from "@/src/hooks/useLocale";
import { InternationalizedText } from "@/src/components/common/InternationalizedText";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  ar: "العربية",
  zh: "中文",
};

/**
 * Minimal language picker wired to the i18n engine. Demonstrates the intended
 * integration pattern: `switchLocale` triggers the on-demand chunk load and
 * re-renders every `InternationalizedText` consumer.
 */
export function LocaleSwitcher() {
  const { locale, availableLocales, isSwitching, switchLocale } = useLocale();

  return (
    <label className="inline-flex items-center gap-2">
      <InternationalizedText id="locale.switch" as="span" />
      <select
        value={locale}
        disabled={isSwitching}
        onChange={(e) => void switchLocale(e.target.value)}
        aria-busy={isSwitching}
      >
        {availableLocales.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code] ?? code}
          </option>
        ))}
      </select>
    </label>
  );
}
