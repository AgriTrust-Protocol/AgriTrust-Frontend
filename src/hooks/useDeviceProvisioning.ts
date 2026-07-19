import { useState, useCallback } from "react";
import { provisionDevice, confirmDeviceProvision } from "../services/deviceApi";

interface ProvisionResult {
  deviceId: string;
  provisionToken: string;
  expiresIn: number; // seconds
}

interface ConfirmResult {
  success: boolean;
  error?: string;
}

export const useDeviceProvisioning = () => {
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provision = useCallback(async (deviceType: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await provisionDevice(deviceType);
      setProvisionResult(result);
    } catch (e: any) {
      setError(e.message ?? "Provisioning failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmProvision = useCallback(async (deviceId: string, token: string) => {
    setLoading(true);
    setError(null);
    try {
      await confirmDeviceProvision(deviceId, token);
      setConfirmResult({ success: true });
    } catch (e: any) {
      setConfirmResult({ success: false, error: e.message ?? "Confirmation failed" });
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = () => {
    setProvisionResult(null);
    setConfirmResult(null);
    setError(null);
    setLoading(false);
  };

  return {
    provision,
    confirmProvision,
    provisionResult,
    confirmResult,
    loading,
    error,
    reset,
  };
};
