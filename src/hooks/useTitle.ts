"use client";

import { useEffect, useState } from "react";
import type { LandTitle, TitleDocument } from "@/src/components/titles/titleTypes";

function gatewayUrl(uri: string): string {
  if (!uri.startsWith("ipfs://")) return uri;
  return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
}

function asDocuments(value: unknown): TitleDocument[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((document, index) => {
    if (!document || typeof document !== "object") return [];
    const item = document as Record<string, unknown>;
    if (typeof item.name !== "string" || typeof item.uri !== "string") return [];
    return [{
      id: typeof item.id === "string" ? item.id : `${item.name}-${index}`,
      label: item.name,
      type: item.type === "image" || item.type === "pdf" ? item.type : "link",
      uri: item.uri,
    }];
  });
}

/** Loads the extended title metadata stored behind an ERC-721 tokenURI. */
export function useTitle(title: LandTitle | null) {
  const [documents, setDocuments] = useState<TitleDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!title?.tokenUri) return;

    let cancelled = false;
    fetch(gatewayUrl(title.tokenUri))
      .then((response) => {
        if (!response.ok) throw new Error("Metadata is unavailable from IPFS.");
        return response.json() as Promise<Record<string, unknown>>;
      })
      .then((metadata) => {
        if (cancelled) return;
        const metadataDocuments = asDocuments(metadata.documents);
        if (metadataDocuments.length) setDocuments(metadataDocuments);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load title metadata.");
      })

    return () => { cancelled = true; };
  }, [title]);

  return { title: title ? { ...title, documents: documents ?? title.documents } : null, isLoading: Boolean(title?.tokenUri && !documents && !error), error, gatewayUrl };
}
