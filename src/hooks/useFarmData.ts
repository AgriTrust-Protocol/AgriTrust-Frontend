// src/hooks/useFarmData.ts
"use client";

import { useEffect, useState } from "react";
import type { FarmDataResponse, FilterGroup, SortState } from "@/src/types/farm";

interface UseFarmDataArgs {
  farmId: string;
  page: number;
  pageSize?: number;
  sorting: SortState[];
  filterGroup: FilterGroup;
}

interface UseFarmDataResult {
  data: FarmDataResponse | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches a page of farm rows from GET /api/farms/{farmId}/data with
 * server-side pagination, sorting, and filtering.
 */
export function useFarmData({
  farmId,
  page,
  pageSize = 100,
  sorting,
  filterGroup,
}: UseFarmDataArgs): UseFarmDataResult {
  const [data, setData] = useState<FarmDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable string keys so the effect only refires on real state changes.
  const sortingKey = JSON.stringify(sorting);
  const filterKey = JSON.stringify(filterGroup);

  useEffect(() => {
    if (!farmId) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort: sortingKey,
      filters: filterKey,
    });

    fetch(`/api/farms/${encodeURIComponent(farmId)}/data?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load farm data (${res.status})`);
        return res.json() as Promise<FarmDataResponse>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load farm data");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // sortingKey/filterKey stand in for sorting/filterGroup identity
  }, [farmId, page, pageSize, sortingKey, filterKey]);

  return { data, isLoading, error };
}
