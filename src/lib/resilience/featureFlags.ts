/**
 * Public feature flags are deliberately allow-listed. Never read arbitrary
 * NEXT_PUBLIC_* values here: flags are part of the application's safety boundary.
 */
export const featureFlagNames = [
  "analytics",
  "maps",
  "zkpCircuitPreload",
  "serviceWorker",
] as const;

export type FeatureFlag = (typeof featureFlagNames)[number];
export type FeatureFlags = Readonly<Record<FeatureFlag, boolean>>;

export const defaultFeatureFlags: FeatureFlags = Object.freeze({
  analytics: true,
  maps: true,
  zkpCircuitPreload: true,
  serviceWorker: true,
});

const environmentVariables: Record<FeatureFlag, string> = {
  analytics: "NEXT_PUBLIC_FEATURE_ANALYTICS",
  maps: "NEXT_PUBLIC_FEATURE_MAPS",
  zkpCircuitPreload: "NEXT_PUBLIC_FEATURE_ZKP_CIRCUIT_PRELOAD",
  serviceWorker: "NEXT_PUBLIC_FEATURE_SERVICE_WORKER",
};

function parseFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

/** Resolve the build-time flags. Unset flags retain their safe defaults. */
export function getFeatureFlags(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_FEATURE_ANALYTICS: process.env.NEXT_PUBLIC_FEATURE_ANALYTICS,
  NEXT_PUBLIC_FEATURE_MAPS: process.env.NEXT_PUBLIC_FEATURE_MAPS,
  NEXT_PUBLIC_FEATURE_ZKP_CIRCUIT_PRELOAD: process.env.NEXT_PUBLIC_FEATURE_ZKP_CIRCUIT_PRELOAD,
  NEXT_PUBLIC_FEATURE_SERVICE_WORKER: process.env.NEXT_PUBLIC_FEATURE_SERVICE_WORKER,
}): FeatureFlags {
  return Object.freeze(
    featureFlagNames.reduce((flags, name) => {
      flags[name] = parseFlag(env[environmentVariables[name]], defaultFeatureFlags[name]);
      return flags;
    }, {} as Record<FeatureFlag, boolean>),
  );
}
