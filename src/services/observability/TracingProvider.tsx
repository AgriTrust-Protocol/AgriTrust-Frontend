"use client";

import { useEffect } from "react";
import { initializeTracing, shutdownTracing } from "./tracing";

/** Installs one application-wide fetch instrumenter after client hydration. */
export function TracingProvider() {
  useEffect(() => {
    initializeTracing();
    return shutdownTracing;
  }, []);

  return null;
}
