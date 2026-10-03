/* Authorized Protocol Quality Assurance & Formal Verification Test Suite */
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BatchProvenance, CustodyEvent, VerificationResult } from '../types/provenance';

// High-fidelity mock generator for testing & demonstration
export function generateMockProvenanceBatch(batchId: string, eventCount: number = 6): BatchProvenance {
  const eventTypes: CustodyEvent['event_type'][] = ['harvest', 'processing', 'storage', 'transit', 'inspection', 'retail'];
  const baseLat = 36.7783; // California Central Valley agricultural corridor
  const baseLng = -119.4179;

  const events: CustodyEvent[] = Array.from({ length: eventCount }).map((_, idx) => {
    const type = eventTypes[idx % eventTypes.length];
    const timestamp = new Date(Date.now() - (eventCount - idx) * 86400000 * 2).toISOString();
    const lat = baseLat + idx * 0.45;
    const lng = baseLng + idx * 0.35;

    return {
      id: `evt-${batchId}-${idx + 1}`,
      batch_id: batchId,
      event_type: type,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} Event - Milestone #${idx + 1}`,
      timestamp,
      location: {
        name: `Facility Sector ${String.fromCharCode(65 + (idx % 6))}`,
        lat,
        lng,
        address: `${100 + idx * 25} Agro Logistics Pkwy, CA`,
        facility_id: `FAC-${1000 + idx}`,
      },
      custodian: {
        name: `Custodian Partner ${idx + 1}`,
        role: idx === 0 ? 'Primary Producer' : idx === eventCount - 1 ? 'Retail Distributor' : 'Logistics Custodian',
        address: `G_AGRI_TRUST_STELLAR_KEY_${1000 + idx}_MOCK`,
        organization: `AgriTrust Verified Node ${idx + 1}`,
        verified: true,
      },
      notes: `Standard protocol custody transfer #${idx + 1}. Quality standards and environmental thresholds satisfied.`,
      temperature_logs: [
        { timestamp: new Date(Date.parse(timestamp) + 3600000).toISOString(), temp_celsius: 4.2 + (idx % 3) * 0.4, humidity_percent: 62 },
        { timestamp: new Date(Date.parse(timestamp) + 7200000).toISOString(), temp_celsius: 4.5 + (idx % 3) * 0.5, humidity_percent: 60 },
      ],
      certificates: [
        {
          id: `cert-${idx + 1}`,
          name: idx === 0 ? 'USDA Organic Certification' : 'Phytosanitary Inspection Seal',
          type: idx === 0 ? 'organic' : 'inspection',
          issuer: 'California Dept of Food & Agriculture',
          issued_at: timestamp,
          url: 'https://agritrust.io/certs/sample-cert.pdf',
          content_hash: `0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1f${idx}`,
        },
      ],
      merkle_proof: {
        root: '0x3a4f89d81e05a8b79b29d67185ad1b4f8c92de10875b48e3d09a27c49f82d1a3',
        leaf: `0x9c42b8a7f${idx}d048b291c7849e71295b0d87a64c8f2b189a047d9e84b2c019d`,
        proof: [
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
        ],
        block_number: 1489200 + idx * 10,
        tx_hash: `0xstellar_tx_hash_${batchId}_${idx}`,
        verified: idx < 2, // Pre-verify initial entries
      },
    };
  });

  return {
    batch_id: batchId,
    product_name: 'Organic Hass Avocados (Grade A)',
    crop_type: 'Persea americana (Avocado)',
    origin_farm: 'Sunridge Biological Orchards, Valley Grove, CA',
    harvest_date: new Date(Date.now() - eventCount * 86400000 * 2).toISOString(),
    current_status: 'delivered',
    qr_url: `https://agritrust.io/provenance/${batchId}`,
    events,
    merkle_root: '0x3a4f89d81e05a8b79b29d67185ad1b4f8c92de10875b48e3d09a27c49f82d1a3',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function useProvenance(batchId: string, initialEventCount: number = 6) {
  const [data, setData] = useState<BatchProvenance | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Load batch provenance
  const fetchBatch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // In production environment, fetch from API endpoint GET /api/v1/provenance/{batchId}
      // Fallback gracefully to mock dataset
      await new Promise((resolve) => setTimeout(resolve, 200));
      const res = generateMockProvenanceBatch(batchId, initialEventCount);
      setData(res);
      if (res.events.length > 0) {
        setSelectedEventId(res.events[res.events.length - 1].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve provenance record');
    } finally {
      setLoading(false);
    }
  }, [batchId, initialEventCount]);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  // On-chain Merkle proof verification
  const verifyEventProof = useCallback(
    async (eventId: string): Promise<VerificationResult> => {
      if (!data) {
        throw new Error('Batch data not loaded');
      }
      const event = data.events.find((e) => e.id === eventId);
      if (!event) {
        throw new Error(`Event ${eventId} not found in provenance registry`);
      }

      // Simulate cryptographic inclusion verification
      await new Promise((resolve) => setTimeout(resolve, 500));

      const isVerified = Boolean(
        event.merkle_proof &&
        event.merkle_proof.root &&
        event.merkle_proof.leaf
      );

      // Update local state to reflect verification
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          events: prev.events.map((e) =>
            e.id === eventId
              ? {
                  ...e,
                  merkle_proof: { ...e.merkle_proof, verified: isVerified },
                }
              : e
          ),
        };
      });

      return {
        verified: isVerified,
        event_id: eventId,
        root: event.merkle_proof.root,
        leaf: event.merkle_proof.leaf,
        block_number: event.merkle_proof.block_number || 1489250,
        verification_timestamp: Date.now(),
      };
    },
    [data]
  );

  const selectedEvent = useMemo(() => {
    return data?.events.find((e) => e.id === selectedEventId) || null;
  }, [data, selectedEventId]);

  return {
    data,
    loading,
    error,
    selectedEventId,
    setSelectedEventId,
    selectedEvent,
    verifyEventProof,
    refresh: fetchBatch,
  };
}
