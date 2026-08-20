"use client";

import { type ElementType } from "react";
import { useLocale } from "@/src/hooks/useLocale";
import type { ICUVariables } from "@/src/services/i18n/icuParser";

export interface InternationalizedTextProps {
  /** Message id to translate (e.g. "cert.count"). */
  id: string;
  /** ICU variables for interpolation/pluralization. */
  vars?: ICUVariables;
  /**
   * Optional wrapper element. When omitted the translated string is rendered
   * as a bare text node (no extra DOM).
   */
  as?: ElementType;
  /** Forwarded to the wrapper element when `as` is provided. */
  className?: string;
}

/**
 * Renders a translated, ICU-formatted message for the active locale.
 *
 * SSR-safe: the default locale (English) is bundled and resolved
 * synchronously, so server and first client render produce identical text —
 * no hydration mismatch. Switching locales re-renders via context.
 *
 * The output is always a plain string (no HTML interpretation), so message
 * content cannot inject markup — translations stay text-only by construction.
 */
export function InternationalizedText({
  id,
  vars,
  as,
  className,
}: InternationalizedTextProps) {
  const { t } = useLocale();
  const text = t(id, vars);

  if (!as) return <>{text}</>;

  const Tag = as;
  return <Tag className={className}>{text}</Tag>;
}
